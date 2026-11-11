import pg from 'pg';
import Cursor from 'pg-cursor';
import { pool } from '../db/pool.js';
import { WeatherData, WeatherRow, WeatherStats } from './dto.js';

export type DateRange = { from?: string; to?: string };

// Bounds are always bound as parameters: a single index range scan on (location, date).
const RANGE = `date BETWEEN COALESCE($2::date, '-infinity') AND COALESCE($3::date, 'infinity')`;

export class WeatherDataRepository {
  constructor(private readonly db: pg.Pool = pool) {}

  async createTable(): Promise<void> {
    const query = `
            CREATE TABLE IF NOT EXISTS weather (
                location VARCHAR(256),
                date DATE,
                temperature DECIMAL,
                humidity DECIMAL,
                PRIMARY KEY(location, date)
            )
        `;
    await this.db.query(query);
  }

  // One round-trip for the whole batch; idempotent for the ingestion robots (re-sent data is updated).
  async upsertMany(data: WeatherData[]): Promise<void> {
    const unique = new Map<string, WeatherData>();
    for (const d of data) unique.set(`${d.location}|${d.date}`, d);
    const rows = [...unique.values()];

    await this.db.query(
      `INSERT INTO weather (location, date, temperature, humidity)
       SELECT * FROM UNNEST($1::varchar[], $2::date[], $3::numeric[], $4::numeric[])
       ON CONFLICT (location, date)
       DO UPDATE SET temperature = EXCLUDED.temperature, humidity = EXCLUDED.humidity`,
      [rows.map((r) => r.location), rows.map((r) => r.date), rows.map((r) => r.temperature), rows.map((r) => r.humidity)]
    );
  }

  async locationExists(location: string): Promise<boolean> {
    const result = await this.db.query('SELECT 1 FROM weather WHERE location = $1 LIMIT 1', [location]);
    return (result.rowCount ?? 0) > 0;
  }

  // avg / min / max / count computed by PostgreSQL: only one row travels on the network.
  async getStats(location: string, { from, to }: DateRange): Promise<WeatherStats> {
    const result = await this.db.query<WeatherStats>(
      `SELECT count(*)::int AS count, avg(temperature) AS avg, min(temperature) AS min, max(temperature) AS max
       FROM weather WHERE location = $1 AND ${RANGE}`,
      [location, from ?? null, to ?? null]
    );
    return result.rows[0];
  }

  // Keyset pagination: cost is O(limit) whatever the page number (no OFFSET).
  async getPage(location: string, { from, to }: DateRange, limit: number, cursor?: string): Promise<WeatherRow[]> {
    const result = await this.db.query<WeatherRow>(
      `SELECT location, date, temperature, humidity
       FROM weather
       WHERE location = $1 AND ${RANGE} AND date > COALESCE($4::date, '-infinity')
       ORDER BY date
       LIMIT $5`,
      [location, from ?? null, to ?? null, cursor ?? null, limit]
    );
    return result.rows;
  }

  // Server-side cursor read by batches: memory stays constant whatever the volume,
  // and each batch is serialized in one JSON.stringify call (not row by row).
  async *streamBatches(location: string, { from, to }: DateRange, batchSize = 2000): AsyncGenerator<WeatherRow[]> {
    const client = await this.db.connect();
    const cursor = client.query(
      new Cursor<WeatherRow>(
        `SELECT location, date, temperature, humidity FROM weather
         WHERE location = $1 AND ${RANGE} ORDER BY date`,
        [location, from ?? null, to ?? null]
      )
    );
    let failure: Error | undefined;
    try {
      for (;;) {
        const rows = await cursor.read(batchSize);
        if (rows.length === 0) return;
        yield rows;
      }
    } catch (error) {
      failure = error as Error;
      throw error;
    } finally {
      await cursor.close().catch(() => undefined);
      // A failed connection is destroyed instead of being returned to the pool
      client.release(failure);
    }
  }
}

export default new WeatherDataRepository();
