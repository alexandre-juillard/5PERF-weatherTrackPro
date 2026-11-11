import http from 'node:http';
import config from 'config';
import logger, { flushLogs } from './logger.js';
import server from './server.js';
import { pool } from './db/pool.js';
import cache from './cache.js';
import { registry } from './metrics.js';
import WeatherDataRepository from './weather/repository.js';

const shutdownTimeoutMs = 10_000;

// Prometheus endpoint, on a separate (non public) port. In cluster mode the primary serves
// the aggregated metrics of all the workers instead.
function startMetricsServer(): http.Server {
  const port = config.get<number>('metrics.port');
  return http
    .createServer(async (_req, res) => {
      res.setHeader('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    })
    .listen(port, () => logger.info({ port }, 'Metrics server started'))
    .on('error', (error) => logger.error({ err: error }, 'Metrics server error'));
}

export async function startWorker(): Promise<void> {
  const standalone = !process.env.NODE_UNIQUE_ID; // not forked by the cluster primary
  const port = config.get<number>('api.port');
  logger.info('starting');
  await cache.connect();

  // The schema is managed by migrations (npm run migrate up); only partition upkeep is done here.
  if (standalone || process.env.CLUSTER_LEADER === '1') {
    try {
      await WeatherDataRepository.ensurePartitions();
    } catch (error) {
      logger.warn({ err: error }, 'Could not create the yearly partitions');
    }
  }

  const httpServer = server
    .listen(port, () => logger.info({ port }, 'Server started'))
    .on('error', (error) => {
      logger.error({ err: error }, 'API server error');
      flushLogs();
      process.exit(1);
    });
  // Must be higher than the load balancer idle timeout to avoid 502 on reused connections
  httpServer.keepAliveTimeout = config.get<number>('api.keepAliveTimeoutMs');
  httpServer.headersTimeout = httpServer.keepAliveTimeout + 1000;

  const metricsServer = standalone ? startMetricsServer() : null;

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'Graceful shutdown');
    setTimeout(() => {
      logger.error('Graceful shutdown timed out');
      flushLogs();
      process.exit(1);
    }, shutdownTimeoutMs).unref();

    // Stop accepting connections, let in-flight requests finish, then close the resources
    await new Promise((resolve) => httpServer.close(resolve));
    metricsServer?.close();
    await Promise.allSettled([pool.end(), cache.close()]);
    flushLogs();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('message', (message) => {
    if (message === 'shutdown') void shutdown('cluster');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Got uncaught exception');
    flushLogs();
    process.exit(1);
  });
}
