import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  LocationParamsSchema,
  WeatherDataInput,
  WeatherDataInputSchema,
  WeatherFilter,
  WeatherFilterSchema,
  WeatherPage,
  WeatherPageSchema,
  WeatherStats,
} from './dto.js';
import WeatherService from './service.js';
import logger from '../logger.js';
import { validate } from '../validate.js';

// Express 4 does not catch rejected promises: forward them to the error middleware.
const asyncHandler =
  (handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

const notFound = (res: Response) => res.status(404).json({ error: 'Unknown location' });

const waitDrain = (res: Response) =>
  new Promise<void>((resolve) => {
    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      resolve();
    };
    res.on('drain', done);
    res.on('close', done);
  });

const router = express.Router();

router.post(
  '/data',
  validate({ body: WeatherDataInputSchema }),
  asyncHandler(async (_req, res) => {
    await WeatherService.addData(res.locals.body as WeatherDataInput);
    res.sendStatus(200);
  })
);

router.get(
  '/data/:location',
  validate({ params: LocationParamsSchema, query: WeatherPageSchema }),
  asyncHandler(async (req, res) => {
    const { location } = res.locals.params;
    const { from, to, limit, cursor } = res.locals.query as WeatherPage;
    const page = await WeatherService.getPage(location, { from, to }, limit, cursor);
    if (page === null) return notFound(res);
    if (page.nextCursor) {
      const next = new URLSearchParams({ ...(from && { from }), ...(to && { to }), limit: String(limit), cursor: page.nextCursor });
      res.set('X-Next-Cursor', page.nextCursor);
      res.set('Link', `<${req.baseUrl}${req.path}?${next}>; rel="next"`);
    }
    res.json(page.rows);
  })
);

// Full history export, streamed as a JSON array: constant memory, first bytes sent immediately.
router.get(
  '/export/:location',
  validate({ params: LocationParamsSchema, query: WeatherFilterSchema }),
  asyncHandler(async (_req, res) => {
    const { location } = res.locals.params;
    const batches = await WeatherService.exportData(location, res.locals.query as WeatherFilter);
    if (batches === null) return notFound(res);

    res.type('application/json');
    res.write('[');
    let first = true;
    try {
      for await (const rows of batches) {
        if (res.destroyed) break; // client gone: stops the cursor and frees the DB connection
        const json = JSON.stringify(rows);
        const chunk = (first ? '' : ',') + json.slice(1, -1);
        first = false;
        // Backpressure: wait for the socket to drain before reading the next batch
        if (!res.write(chunk)) await waitDrain(res);
      }
      res.end(']');
    } catch (error) {
      // Headers are already sent: abort the connection so the client sees a truncated body.
      logger.warn('Export interrupted', { location, error: (error as Error).message });
      res.destroy(error as Error);
    }
  })
);

router.get(
  '/stats/:location',
  validate({ params: LocationParamsSchema, query: WeatherFilterSchema }),
  asyncHandler(async (_req, res) => {
    const stats = await WeatherService.getStats(res.locals.params.location, res.locals.query as WeatherFilter);
    if (stats === null) return notFound(res);
    res.json(stats);
  })
);

// avg / max / min share the same SQL aggregate query
const statRoute = (path: string, key: keyof WeatherStats) =>
  router.get(
    `/${path}/:location`,
    validate({ params: LocationParamsSchema, query: WeatherFilterSchema }),
    asyncHandler(async (_req, res) => {
      const stats = await WeatherService.getStats(res.locals.params.location, res.locals.query as WeatherFilter);
      if (stats === null) return notFound(res);
      res.json({ [path]: stats[key] });
    })
  );

statRoute('avg', 'avg');
statRoute('max', 'max');
statRoute('min', 'min');

export default router;
