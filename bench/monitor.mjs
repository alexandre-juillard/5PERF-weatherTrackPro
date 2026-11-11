// Preloaded (node --import ./bench/monitor.mjs) into the server under test, so that the
// SAME instrumentation is applied to the original and the optimized code without touching it.
// Exposes http://localhost:<9464 + workerId>/stats  (?reset=1 to start a new window).
//         http://localhost:<port>/profile?seconds=10&out=path.cpuprofile  (V8 CPU profile)
//         http://localhost:<port>/heap?out=path.heapsnapshot                (heap snapshot)
import http from 'node:http';
import cluster from 'node:cluster';
import inspector from 'node:inspector/promises';
import v8 from 'node:v8';
import { writeFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();

let cpuStart = process.cpuUsage();
let wallStart = performance.now();
let peakRss = 0;
let peakHeap = 0;

const sampler = setInterval(() => {
  const { rss, heapUsed } = process.memoryUsage();
  peakRss = Math.max(peakRss, rss);
  peakHeap = Math.max(peakHeap, heapUsed);
}, 100);
sampler.unref();

const ms = (ns) => Math.round((ns / 1e6) * 100) / 100;
const mb = (b) => Math.round((b / 1024 / 1024) * 10) / 10;

function snapshot() {
  const cpu = process.cpuUsage(cpuStart);
  const wallMs = performance.now() - wallStart;
  return {
    pid: process.pid,
    wallMs: Math.round(wallMs),
    cpuPercent: Math.round(((cpu.user + cpu.system) / 1000 / wallMs) * 1000) / 10,
    eventLoopDelayMs: {
      mean: ms(histogram.mean),
      p50: ms(histogram.percentile(50)),
      p99: ms(histogram.percentile(99)),
      max: ms(histogram.max),
    },
    peakRssMb: mb(peakRss),
    peakHeapUsedMb: mb(peakHeap),
  };
}

function reset() {
  histogram.reset();
  cpuStart = process.cpuUsage();
  wallStart = performance.now();
  const { rss, heapUsed } = process.memoryUsage();
  peakRss = rss;
  peakHeap = heapUsed;
}

const isPrimaryOfCluster = cluster.isPrimary && process.env.WORKERS && Number(process.env.WORKERS) > 1;
if (!isPrimaryOfCluster) {
  const port = 9464 + (cluster.isWorker ? cluster.worker.id : 0);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/profile') {
      const session = new inspector.Session();
      session.connect();
      await session.post('Profiler.enable');
      await session.post('Profiler.setSamplingInterval', { interval: 500 });
      await session.post('Profiler.start');
      await new Promise((r) => setTimeout(r, Number(url.searchParams.get('seconds') ?? 10) * 1000));
      const { profile } = await session.post('Profiler.stop');
      session.disconnect();
      writeFileSync(url.searchParams.get('out'), JSON.stringify(profile));
      return res.end('ok');
    }
    if (url.pathname === '/heap') {
      return res.end(v8.writeHeapSnapshot(url.searchParams.get('out') ?? undefined));
    }
    const body = JSON.stringify(snapshot());
    if (url.searchParams.has('reset')) reset();
    res.setHeader('content-type', 'application/json');
    res.end(body);
  });
  server.listen(port, '127.0.0.1');
  server.unref();
}
