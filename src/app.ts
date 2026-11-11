import express from 'express';
import weatherController from './weather/controller.js';

const app = express();
app.use('/weather', weatherController);

export default app;
