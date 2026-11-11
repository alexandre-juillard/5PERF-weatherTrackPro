import cluster, { Worker } from 'node:cluster';
import http from 'node:http';
import config from 'config';
import client from 'prom-client';
import logger, { flushLogs } from './logger.js';

// One worker per core: the CPU-bound part of the API (HTTP parsing, JSON) scales linearly
// instead of being limited to the single thread of the event loop.
export function startPrimary(workers: number): void {
  // Round-robin distribution (not the default on Windows)
  cluster.schedulingPolicy = cluster.SCHED_RR;
  const aggregator = new client.AggregatorRegistry();
  let stopping = false;
  let leaderAssigned = false;

  const fork = (): Worker => {
    // A single worker runs the startup maintenance tasks (partitions)
    const worker = cluster.fork({ CLUSTER_LEADER: leaderAssigned ? '0' : '1' });
    leaderAssigned = true;
    return worker;
  };

  logger.info({ workers }, 'Starting cluster');
  for (let i = 0; i < workers; i++) fork();

  // Restart crashed workers, with a delay to avoid a crash loop hammering the database
  cluster.on('exit', (worker, code, signal) => {
    if (stopping) return;
    logger.error({ pid: worker.process.pid, code, signal }, 'Worker died, restarting');
    setTimeout(fork, 1000);
  });

  const metricsPort = config.get<number>('metrics.port');
  const metricsServer = http
    .createServer(async (_req, res) => {
      try {
        const metrics = await aggregator.clusterMetrics();
        res.setHeader('Content-Type', aggregator.contentType);
        res.end(metrics);
      } catch (error) {
        res.statusCode = 500;
        res.end((error as Error).message);
      }
    })
    .listen(metricsPort, () => logger.info({ port: metricsPort }, 'Cluster metrics server started'));

  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'Stopping cluster');
    metricsServer.close();
    for (const worker of Object.values(cluster.workers ?? {})) worker?.send('shutdown');
    setTimeout(() => {
      flushLogs();
      process.exit(0);
    }, 11_000).unref();
    cluster.on('exit', () => {
      if (Object.keys(cluster.workers ?? {}).length === 0) {
        flushLogs();
        process.exit(0);
      }
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
