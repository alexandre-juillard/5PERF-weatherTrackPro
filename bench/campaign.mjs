// Final measurement campaign: every version, both datasets, same protocol, one pass.
// Prerequisites: docker compose up -d ; datasets seeded (scripts/seed.mjs) ;
//   git worktrees: .baseline (v0-baseline), .versions/<tag> for v1..v3 with node_modules ; npm run build (v4).
// Usage: node bench/campaign.mjs [--only v0-S,v4c-L] [--runs 3] [--duration 10]
import { spawn, execFileSync } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    only: { type: 'string' },
    runs: { type: 'string', default: '3' },
    duration: { type: 'string', default: '10' },
  },
});

const root = resolve(import.meta.dirname, '..');
const monitor = pathToFileURL(resolve(root, 'bench/monitor.mjs')).href;
const tsNode = ['--import', monitor, '--experimental-loader', 'ts-node/esm', './src/index.ts'];
const compiled = ['--import', monitor, 'dist/index.js'];

const datasets = {
  S: { cities: 100, legacy: 'weather_s_legacy', migrated: 'weather_s' },
  L: { cities: 1000, legacy: 'weather_l_legacy', migrated: 'weather_l' },
};

const versions = [
  { id: 'v0', cwd: '.baseline', argv: tsNode, schema: 'legacy', api: 'v0', workers: 1 },
  { id: 'v1', cwd: '.versions/v1-sql', argv: tsNode, schema: 'legacy', api: 'v1', workers: 1 },
  { id: 'v2', cwd: '.versions/v2-schema', argv: tsNode, schema: 'migrated', api: 'v1', workers: 1 },
  { id: 'v3', cwd: '.versions/v3-cache', argv: tsNode, schema: 'migrated', api: 'v1', workers: 1 },
  { id: 'v4', cwd: '.', argv: compiled, schema: 'migrated', api: 'v1', workers: 1 },
  { id: 'v4c', cwd: '.', argv: compiled, schema: 'migrated', api: 'v1', workers: 4 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(url, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not listening yet
    }
    await sleep(500);
  }
  throw new Error(`Server not ready: ${url}`);
}

async function waitPortFree(url) {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url);
      await sleep(500);
    } catch {
      return;
    }
  }
}

const killTree = (pid) => {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, 'SIGKILL');
  } catch {
    // already stopped
  }
};

for (const [dsName, ds] of Object.entries(datasets)) {
  for (const v of versions) {
    const label = `${v.id}-${dsName}`;
    if (args.only && !args.only.split(',').includes(label)) continue;

    execFileSync('docker', ['exec', 'weather-redis', 'redis-cli', 'FLUSHALL'], { stdio: 'ignore' });
    const database = v.schema === 'legacy' ? ds.legacy : ds.migrated;
    const logFd = openSync(resolve(root, `bench/results/server-${label}.log`), 'w');
    const server = spawn(process.execPath, v.argv, {
      cwd: resolve(root, v.cwd),
      stdio: ['ignore', logFd, logFd],
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NODE_CONFIG: JSON.stringify({ database: { database, host: '127.0.0.1' } }),
        WORKERS: String(v.workers),
      },
    });
    try {
      await waitReady('http://127.0.0.1:3000/weather/avg/City-0001?from=2024-01-01');
      await sleep(2000);
      console.log(`\n=== ${label} (${database}, ${v.workers} process) ===`);
      execFileSync(
        process.execPath,
        [
          'bench/load.mjs', '--label', label, '--api', v.api, '--cities', String(ds.cities),
          '--workers', String(v.workers), '--runs', args.runs, '--duration', args.duration,
        ],
        { cwd: root, stdio: 'inherit' }
      );
    } finally {
      killTree(server.pid);
      closeSync(logFd);
      await waitPortFree('http://127.0.0.1:3000/');
      await sleep(2000);
    }
  }
}
console.log('\nCampaign done');
