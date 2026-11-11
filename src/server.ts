import express, { NextFunction, Request, Response } from 'express';
import config from 'config';
import apiLogger from './apiLogger.js';
import app from './app.js';
import logger from './logger.js';

const server = express();
server.disable('x-powered-by');

server.use(apiLogger);
server.use(express.json({ limit: config.get<string>('api.bodyLimit') }));
server.use(app);

server.use((_req: Request, res: Response) => {
  res.sendStatus(404);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
server.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(error);
  if (!res.headersSent) res.sendStatus(500);
});

export default server;
