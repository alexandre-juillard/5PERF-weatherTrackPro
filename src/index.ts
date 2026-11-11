import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import config from 'config';

// api.workers: 1 = single process, 0 = one worker per CPU core, N = N workers
const configured = Number(config.get('api.workers'));
const workers = configured === 0 ? availableParallelism() : configured;

if (cluster.isPrimary && workers > 1) {
  const { startPrimary } = await import('./primary.js');
  startPrimary(workers);
} else {
  const { startWorker } = await import('./worker.js');
  await startWorker();
}
