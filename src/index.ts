import config from 'config';
import logger from './logger.js';
import server from './server.js';
import WeatherDataRepository from './weather/repository.js';
logger.info('starting');

process.on('SIGINT', () => {
  logger.info('Exit requested by user');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Got uncaught exception', error);
  process.exit(1);
});
const port = config.get<number>('api.port');

await WeatherDataRepository.createTable();

server
  .listen(port, () => {
    logger.info('Server started', { port });
  })
  .on('error', (error) => {
    logger.error('`API server error', error);
    process.exit(1);
  });
