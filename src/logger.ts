import winston from 'winston';
import config from 'config';

const consoleLTransport = new winston.transports.Console({
  level: config.get('logLevel'),
  handleExceptions: true,
});

const logger = winston.createLogger({
  exitOnError: true,
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [consoleLTransport],
});

export default logger;
