// Startup time (spawn -> first HTTP response) and idle memory: ts-node (v0) vs compiled JavaScript (v4).
// Usage: node bench/startup.mjs [runs]
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runs = Number(process.argv[2] ?? 3);
const root = resolve(import.meta.dirname, '..');
const monitor = pathToFileURL(resolve(root, 'bench/monitor.mjs')).href;
const variants = [
  { name: 'v0 (ts-node, npm start d\'origine)', cwd: '.baseline', argv: ['--import', monitor, '--experimental-loader', 'ts-node/esm', './src/index.ts'], db: 'weather_s_legacy' },
  { name: 'v4 (dist/, npm start)', cwd: '.', argv: ['--import', monitor, 'dist/index.js'], db: 'weather_s' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const v of variants) {
  const times = [];
  const rss = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const child = spawn(process.execPath, v.argv, {
      cwd: resolve(root, v.cwd),
      stdio: 'ignore',
      env: { ...process.env, WORKERS: '1', NODE_CONFIG: JSON.stringify({ database: { database: v.db, host: '127.0.0.1' } }) },
    });
    for (;;) {
      try {
        await fetch('http://127.0.0.1:3000/weather/avg/City-0001?from=2024-01-01');
        break;
      } catch {
        await sleep(20);
      }
    }
    times.push(performance.now() - start);
    await sleep(3000);
    const stats = await (await fetch('http://127.0.0.1:9464/stats?reset=1')).json();
    await sleep(300);
    rss.push((await (await fetch('http://127.0.0.1:9464/stats')).json()).peakRssMb ?? stats.peakRssMb);
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(1500);
  }
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`${v.name.padEnd(36)} démarrage médian ${Math.round(med(times))} ms | RSS au repos ${med(rss)} Mo`);
}
