// Load-test harness (autocannon). Same protocol for every version of the API.
// Usage:
//   node bench/load.mjs --label v0-S --api v0 --cities 100 [--scenarios avg-full,data-1y]
//                       [--workers 1] [--connections 50] [--duration 10] [--runs 3]
// Results are written to bench/results/<label>.json
import autocannon from 'autocannon';
import { writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    label: { type: 'string' },
    api: { type: 'string', default: 'v1' },
    cities: { type: 'string', default: '100' },
    scenarios: { type: 'string', default: 'avg-full,avg-1y,data-1y,data-full,hot' },
    workers: { type: 'string', default: '1' },
    connections: { type: 'string', default: '50' },
    duration: { type: 'string', default: '10' },
    runs: { type: 'string', default: '3' },
    url: { type: 'string', default: 'http://localhost:3000' },
    // Capture a V8 CPU profile of the server during the first load run: <dir>/<label>-<scenario>.cpuprofile
    profile: { type: 'string' },
  },
});

const cities = Number(args.cities);
const connections = Number(args.connections);
const duration = Number(args.duration);
const runs = Number(args.runs);
const workers = Number(args.workers);

// Deterministic pseudo-random generator so that every version receives the same request mix
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const pick = (rand, n) => Math.floor(rand() * n);
const city = (i) => `City-${String(i + 1).padStart(4, '0')}`;
const year = (rand) => 1995 + pick(rand, 30);

const hotPaths = [];
for (let c = 0; c < 5; c++) {
  for (const y of [2022, 2023, 2024]) {
    hotPaths.push(`/weather/avg/${city(c)}?from=${y}-01-01&to=${y}-12-31`);
    hotPaths.push(`/weather/max/${city(c)}?from=${y}-01-01&to=${y}-12-31`);
    hotPaths.push(`/weather/min/${city(c)}?from=${y}-01-01&to=${y}-12-31`);
    hotPaths.push(`/weather/data/${city(c)}?from=${y}-06-01&to=${y}-06-30`);
  }
  hotPaths.push(`/weather/avg/${city(c)}`);
}

const scenarios = {
  // Mean over the full 30-year history of a random city (~11k rows)
  'avg-full': (rand) => `/weather/avg/${city(pick(rand, cities))}`,
  // Mean over one random year of a random city (~365 rows)
  'avg-1y': (rand) => {
    const y = year(rand);
    return `/weather/avg/${city(pick(rand, cities))}?from=${y}-01-01&to=${y}-12-31`;
  },
  // Raw data of one random year (~365 rows)
  'data-1y': (rand) => {
    const y = year(rand);
    return `/weather/data/${city(pick(rand, cities))}?from=${y}-01-01&to=${y}-12-31`;
  },
  // Full history export of a random city (~11k rows). v1 uses the streaming endpoint.
  'data-full': (rand) =>
    args.api === 'v0'
      ? `/weather/data/${city(pick(rand, cities))}`
      : `/weather/export/${city(pick(rand, cities))}`,
  // Realistic "popular queries" mix: a small set of repeated requests (cache friendly)
  hot: (rand) => hotPaths[pick(rand, hotPaths.length)],
};

const monitorPorts = workers > 1 ? Array.from({ length: workers }, (_, i) => 9465 + i) : [9464];

async function monitor(reset) {
  const stats = await Promise.all(
    monitorPorts.map((p) =>
      fetch(`http://127.0.0.1:${p}/stats${reset ? '?reset=1' : ''}`)
        .then((r) => r.json())
        .catch(() => null)
    )
  );
  const ok = stats.filter(Boolean);
  if (ok.length === 0) return null;
  return {
    processes: ok.length,
    cpuPercent: Math.round(ok.reduce((a, s) => a + s.cpuPercent, 0) * 10) / 10,
    eventLoopDelayP99Ms: Math.max(...ok.map((s) => s.eventLoopDelayMs.p99)),
    eventLoopDelayMaxMs: Math.max(...ok.map((s) => s.eventLoopDelayMs.max)),
    eventLoopDelayMeanMs: Math.round((ok.reduce((a, s) => a + s.eventLoopDelayMs.mean, 0) / ok.length) * 100) / 100,
    peakRssMb: Math.round(ok.reduce((a, s) => a + s.peakRssMb, 0) * 10) / 10,
    peakHeapUsedMb: Math.round(ok.reduce((a, s) => a + s.peakHeapUsedMb, 0) * 10) / 10,
  };
}

function run(pathFn, seed, conns, dur) {
  const rand = rng(seed);
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url: args.url,
        connections: conns,
        duration: dur,
        timeout: 30,
        requests: [
          {
            setupRequest: (req) => ({ ...req, path: pathFn(rand) }),
          },
        ],
      },
      (err, res) => (err ? reject(err) : resolve(res))
    );
  });
}

const summarize = (r) => ({
  rps: Math.round(r.requests.average * 10) / 10,
  latencyMs: {
    p50: r.latency.p50,
    p90: r.latency.p90,
    p99: r.latency.p99,
    max: r.latency.max,
    mean: Math.round(r.latency.average * 100) / 100,
  },
  throughputMBs: Math.round((r.throughput.average / 1024 / 1024) * 100) / 100,
  total: r.requests.total,
  errors: r.errors + r.timeouts,
  non2xx: r.non2xx,
});

const median = (arr, f) => {
  const sorted = [...arr].sort((a, b) => f(a) - f(b));
  return sorted[Math.floor(sorted.length / 2)];
};

const results = {
  label: args.label,
  api: args.api,
  cities,
  workers,
  connections,
  duration,
  runs,
  date: new Date().toISOString(),
  node: process.version,
  scenarios: {},
};

for (const name of args.scenarios.split(',')) {
  const pathFn = scenarios[name];
  if (!pathFn) throw new Error(`Unknown scenario ${name}`);
  process.stdout.write(`[${args.label}] ${name}: warmup`);
  await run(pathFn, 1, Math.min(connections, 10), 3);

  // Unloaded latency (1 connection) = what a single user experiences
  process.stdout.write(' | single');
  const single = summarize(await run(pathFn, 2, 1, Math.max(5, Math.round(duration * 0.6))));

  const loadRuns = [];
  for (let i = 0; i < runs; i++) {
    process.stdout.write(` | load#${i + 1}`);
    await monitor(true);
    const profiling =
      i === 0 && args.profile
        ? fetch(
            `http://127.0.0.1:${monitorPorts[0]}/profile?seconds=${duration - 1}&out=${encodeURIComponent(
              `${args.profile}/${args.label}-${name}.cpuprofile`
            )}`
          )
        : null;
    const s = summarize(await run(pathFn, 100 + i, connections, duration));
    await profiling;
    s.server = await monitor(false);
    loadRuns.push(s);
  }
  const med = median(loadRuns, (r) => r.rps);
  results.scenarios[name] = { single, load: med, loadRuns };
  console.log(
    `\n   single p50=${single.latencyMs.p50}ms p99=${single.latencyMs.p99}ms` +
      ` | load ${med.rps} req/s p50=${med.latencyMs.p50}ms p99=${med.latencyMs.p99}ms` +
      ` errors=${med.errors} non2xx=${med.non2xx}` +
      (med.server ? ` | ELD p99=${med.server.eventLoopDelayP99Ms}ms cpu=${med.server.cpuPercent}% rss=${med.server.peakRssMb}MB` : '')
  );
}

mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`./results/${args.label}.json`, import.meta.url), JSON.stringify(results, null, 2));
console.log(`Saved bench/results/${args.label}.json`);
