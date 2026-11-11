// Functional non-regression: compares the ORIGINAL API (v0, legacy schema) and the OPTIMIZED API
// (migrated schema) on the same dataset, for random cities and date ranges.
// Usage: node bench/compare-versions.mjs <v0Url> <newUrl> <cities> [samples]
// Intentional differences (documented) are normalized:
//   - v0 `from` is exclusive  -> v0 is called with from - 1 day
//   - v0 dates are local-midnight timestamps -> converted to the local calendar day
//   - v0 crashes (500) on empty ranges -> such ranges are not generated
const [v0 = 'http://localhost:3000', next = 'http://localhost:3100', cities = '100', samples = '300'] =
  process.argv.slice(2);

let seed = 42;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const day = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => day(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000));
const localDay = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const close = (a, b) => a === b || (a !== null && b !== null && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)));
const get = async (url) => {
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
};

const failures = [];
let checks = 0;

for (let i = 0; i < Number(samples); i++) {
  const city = `City-${String(1 + Math.floor(rand() * Number(cities))).padStart(4, '0')}`;
  const start = day(new Date(Date.UTC(1995, 0, 1) + Math.floor(rand() * 10900) * 86400000));
  const end = addDays(start, Math.floor(rand() * 400));
  const full = i % 10 === 0; // 10% of the samples on the full history

  const qsNew = full ? '' : `?from=${start}&to=${end}`;
  const qsOld = full ? '' : `?from=${addDays(start, -1)}&to=${end}`;

  for (const metric of ['avg', 'min', 'max']) {
    const [a, b] = await Promise.all([get(`${v0}/weather/${metric}/${city}${qsOld}`), get(`${next}/weather/${metric}/${city}${qsNew}`)]);
    checks++;
    if (a.status !== 200 || b.status !== 200 || !close(a.body[metric], b.body[metric])) {
      failures.push({ city, qsNew, metric, v0: a.body, new: b.body });
    }
  }

  if (!full) {
    const [a, b] = await Promise.all([
      get(`${v0}/weather/data/${city}${qsOld}`),
      get(`${next}/weather/data/${city}${qsNew}&limit=5000`),
    ]);
    checks++;
    const oldRows = a.body.map((r) => ({ ...r, date: localDay(r.date) }));
    if (JSON.stringify(oldRows) !== JSON.stringify(b.body)) {
      failures.push({ city, qsNew, metric: 'data', v0Rows: oldRows.length, newRows: b.body.length });
    }
  }
}

console.log(`${checks} comparisons, ${failures.length} differences`);
if (failures.length) console.log(JSON.stringify(failures.slice(0, 10), null, 2));
process.exit(failures.length ? 1 : 0);
