import morgan, { Options, StreamOptions } from 'morgan';
import logger from './logger.js';
import config from 'config';

const logFormat = config.get<string>('api.logFormat');

const stream: StreamOptions = {
  write: (log: string) => {
    logger.info(log.trim());
  },
};

const apiLogger = morgan(logFormat, {
  stream,
});

export default apiLogger;
