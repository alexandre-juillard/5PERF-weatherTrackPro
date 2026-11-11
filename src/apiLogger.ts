import { pinoHttp } from 'pino-http';
import config from 'config';
import logger from './logger.js';

// One compact JSON line per request (method, url, status, duration), like the former morgan 'tiny' format.
const apiLogger = pinoHttp({
  logger,
  autoLogging: config.get<boolean>('api.accessLog'),
  quietReqLogger: true,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

export default apiLogger;
