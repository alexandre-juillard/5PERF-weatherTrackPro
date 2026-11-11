import request from 'supertest';
import server from '../src/server.js';
import { pool } from '../src/db/pool.js';
import cache from '../src/cache.js';

// Integration tests: real PostgreSQL (migrated test database) and real Redis (docker compose up -d)
const city = `Test-${Date.now()}`;
const measures = [
  { location: city, date: '2023-12-22', temperature: 27, humidity: 40 },
  { location: city, date: '2023-12-23', temperature: 20.5, humidity: 50 },
  { location: city, date: '2023-12-24', temperature: 25, humidity: 40 },
  { location: city, date: '2023-12-25', temperature: 23, humidity: 45 },
];

beforeAll(async () => {
  await cache.connect();
  await request(server).post('/weather/data').send(measures).expect(200);
});

afterAll(async () => {
  await cache.invalidate([city]);
  await Promise.all([pool.end(), cache.close()]);
});

describe('GET /weather/{avg,min,max,stats}/:location', () => {
  it('aggregates the whole history', async () => {
    const res = await request(server).get(`/weather/stats/${city}`).expect(200);
    expect(res.body).toEqual({ count: 4, avg: 23.875, min: 20.5, max: 27 });
  });

  it('includes both bounds of the date range', async () => {
    await request(server).get(`/weather/avg/${city}?from=2023-12-23&to=2023-12-24`).expect(200, { avg: 22.75 });
    await request(server).get(`/weather/min/${city}?from=2023-12-23&to=2023-12-24`).expect(200, { min: 20.5 });
    await request(server).get(`/weather/max/${city}?to=2023-12-23`).expect(200, { max: 27 });
  });

  it('returns null (not a 500) when the range is empty', async () => {
    await request(server).get(`/weather/max/${city}?from=2030-01-01`).expect(200, { max: null });
    await request(server).get(`/weather/avg/${city}?from=2030-01-01`).expect(200, { avg: null });
  });

  it('returns 404 for an unknown location and 400 for an invalid date', async () => {
    await request(server).get('/weather/avg/Atlantis').expect(404);
    const res = await request(server).get(`/weather/avg/${city}?from=foo`).expect(400);
    expect(res.body[0].type).toBe('Query');
  });
});

describe('GET /weather/data/:location', () => {
  it('returns the measures as YYYY-MM-DD days', async () => {
    const res = await request(server).get(`/weather/data/${city}?from=2023-12-24`).expect(200);
    expect(res.body).toEqual(measures.slice(2));
    expect(res.headers['cache-control']).toContain('max-age');
  });

  it('paginates with a keyset cursor', async () => {
    const page1 = await request(server).get(`/weather/data/${city}?limit=3`).expect(200);
    expect(page1.body).toHaveLength(3);
    expect(page1.headers['x-next-cursor']).toBe('2023-12-24');
    expect(page1.headers.link).toContain('cursor=2023-12-24');

    const page2 = await request(server).get(`/weather/data/${city}?limit=3&cursor=2023-12-24`).expect(200);
    expect(page2.body).toEqual([measures[3]]);
    expect(page2.headers['x-next-cursor']).toBeUndefined();
  });
});

describe('GET /weather/export/:location', () => {
  it('streams the full history as a JSON array', async () => {
    const res = await request(server).get(`/weather/export/${city}`).expect(200);
    expect(res.body).toEqual(measures);
  });

  it('streams an empty array for an empty range', async () => {
    const res = await request(server).get(`/weather/export/${city}?from=2030-01-01`).expect(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /weather/data', () => {
  it('is idempotent (upsert) and invalidates the cache', async () => {
    await request(server).get(`/weather/max/${city}`).expect(200, { max: 27 }); // cached
    await request(server)
      .post('/weather/data')
      .send({ location: city, date: '2023-12-22', temperature: 30, humidity: 40 })
      .expect(200);
    await request(server).get(`/weather/max/${city}`).expect(200, { max: 30 });
    const res = await request(server).get(`/weather/stats/${city}`).expect(200);
    expect(res.body.count).toBe(4);
  });

  it('rejects an invalid body', async () => {
    await request(server).post('/weather/data').send({ location: city, date: 'nope' }).expect(400);
  });
});
