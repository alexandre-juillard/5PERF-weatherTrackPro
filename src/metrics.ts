import client from 'prom-client';
import cluster from 'node:cluster';
import { RequestHandler } from 'express';
import { pool } from './db/pool.js';
import cache from './cache.js';

// In cluster mode, workers must answer the metrics requests of the primary (AggregatorRegistry)
if (cluster.isWorker) new client.AggregatorRegistry();

// Process metrics: CPU, memory, GC, event loop lag (p50/p90/p99), active handles...
client.collectDefaultMetrics({ eventLoopMonitoringPrecision: 10 });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration by route',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

const cacheRequests = new client.Counter({
  name: 'cache_requests_total',
  help: 'Cache lookups by result (hit, miss, error)',
  labelNames: ['result'] as const,
});
cache.onResult = (result) => cacheRequests.inc({ result });

new client.Gauge({
  name: 'db_pool_connections',
  help: 'PostgreSQL pool connections by state',
  labelNames: ['state'] as const,
  collect() {
    this.set({ state: 'total' }, pool.totalCount);
    this.set({ state: 'idle' }, pool.idleCount);
    this.set({ state: 'waiting' }, pool.waitingCount);
  },
});

export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const end = httpDuration.startTimer();
  res.once('finish', () => {
    end({ method: req.method, route: req.route?.path ?? 'unmatched', status: res.statusCode });
  });
  next();
};

export const registry = client.register;
