import express from 'express';
import { validateRequest } from 'zod-express-middleware';
import { WeatherData, WeatherDataSchema, WeatherFilterSchema } from './dto.js';
import WeatherService from './service.js';
import logger from '../logger.js';

const router = express();

router.post(
  '/data',
  validateRequest({ body: WeatherDataSchema }),
  async (req, res) => {
    const data: WeatherData = req.body;

    try {
      await WeatherService.addData(data);
    } catch (error) {
      logger.error(error);
      return res.sendStatus(500);
    }
    return res.sendStatus(200);
  }
);

router.get(
  '/data/:location',
  validateRequest({ query: WeatherFilterSchema }),
  async (req, res) => {
    const { location } = req.params;
    const options = req.query;
    try {
      const data = await WeatherService.getData(location, options);
      return res.json(data);
    } catch (error) {
      logger.error(error);
      return res.sendStatus(500);
    }
  }
);

router.get(
  '/avg/:location',
  validateRequest({ query: WeatherFilterSchema }),
  async (req, res) => {
    const { location } = req.params;
    const options = req.query;
    try {
      const avg = await WeatherService.getMean(location, options);
      return res.json({ avg });
    } catch (error) {
      logger.error(error);
      return res.sendStatus(500);
    }
  }
);

router.get(
  '/max/:location',
  validateRequest({ query: WeatherFilterSchema }),
  async (req, res) => {
    const { location } = req.params;
    const options = req.query;
    try {
      const max = await WeatherService.getMax(location, options);
      return res.json({ max });
    } catch (error) {
      logger.error(error);
      return res.sendStatus(500);
    }
  }
);

router.get(
  '/min/:location',
  validateRequest({ query: WeatherFilterSchema }),
  async (req, res) => {
    const { location } = req.params;
    const options = req.query;
    try {
      const min = await WeatherService.getMin(location, options);
      return res.json({ min });
    } catch (error) {
      logger.error(error);
      return res.sendStatus(500);
    }
  }
);

export default router;
