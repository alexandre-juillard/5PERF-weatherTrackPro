import express from 'express';
import apiLogger from './apiLogger.js';
import app from './app.js';
import bodyParser from 'body-parser';

const server = express();

server.use(apiLogger);
server.use(bodyParser.json());
server.use(app);
app.use((req, res) => {
  return res.sendStatus(404);
});

export default server;
