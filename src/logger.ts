import { pino } from 'pino';
import config from 'config';

// Asynchronous buffered writes: logging no longer blocks the event loop
// (synchronous console writes of winston were ~20% of the CPU in the v1 profile).
const destination = pino.destination({ dest: 1, sync: false, minLength: 4096 });

const logger = pino(
  {
    level: config.get<string>('logLevel'),
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  destination
);

// To be called before process.exit() so that buffered lines are not lost
export const flushLogs = () => {
  try {
    destination.flushSync();
  } catch {
    // destination not ready yet (very early exit)
  }
};

export default logger;
