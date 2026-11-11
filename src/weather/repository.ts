import pg from 'pg';
import Cursor from 'pg-cursor';
import { pool } from '../db/pool.js';
import { WeatherData, WeatherRow, WeatherStats } from './dto.js';

export type DateRange = { from?: string; to?: string };

// Bounds are always bound as parameters: one index range scan on (location_id, date),
// and the planner prunes the yearly partitions outside of the range.
const RANGE = `date BETWEEN COALESCE($2::date, '-infinity') AND COALESCE($3::date, 'infinity')`;

export class WeatherDataRepository {
  // name -> id. Ids are immutable and the number of locations is bounded by the database content.
  private readonly locationIds = new Map<string, number>();

  constructor(private readonly db: pg.Pool = pool) {}

  // Yearly partitions for the current and next year (idempotent).
  async ensurePartitions(now = new Date()): Promise<void> {
    const year = now.getUTCFullYear();
    await this.db.query('SELECT weather_ensure_partition($1), weather_ensure_partition($1 + 1)', [year]);
  }

  async getLocationId(name: string): Promise<number | null> {
    const cached = this.locationIds.get(name);
    if (cached !== undefined) return cached;
    const result = await this.db.query<{ id: number }>('SELECT id FROM locations WHERE name = $1', [name]);
    if (result.rows.length === 0) return null; // unknown names are not cached: a city may be added later
    this.locationIds.set(name, result.rows[0].id);
    return result.rows[0].id;
  }

  // One round-trip for the whole batch (two when it contains new locations).
  // Idempotent for the ingestion robots: re-sent measures are updated.
  async upsertMany(data: WeatherData[]): Promise<void> {
    const unique = new Map<string, WeatherData>();
    for (const d of data) unique.set(`${d.location}|${d.date}`, d);
    const rows = [...unique.values()];
    const names = rows.map((r) => r.location);

    if (names.some((name) => !this.locationIds.has(name))) {
      const known = await this.db.query<{ id: number; name: string }>(
        `WITH created AS (
           INSERT INTO locations (name) SELECT DISTINCT unnest($1::varchar[])
           ON CONFLICT (name) DO NOTHING RETURNING id, name)
         SELECT id, name FROM created
         UNION ALL
         SELECT id, name FROM locations WHERE name = ANY($1::varchar[])`,
        [names]
      );
      for (const { id, name } of known.rows) this.locationIds.set(name, id);
    }
    await this.db.query(
      `INSERT INTO weather (location_id, date, temperature, humidity)
       SELECT l.id, t.date, t.temperature, t.humidity
       FROM UNNEST($1::varchar[], $2::date[], $3::float8[], $4::float8[]) AS t(name, date, temperature, humidity)
       JOIN locations l ON l.name = t.name
       ON CONFLICT (location_id, date)
       DO UPDATE SET temperature = EXCLUDED.temperature, humidity = EXCLUDED.humidity`,
      [names, rows.map((r) => r.date), rows.map((r) => r.temperature), rows.map((r) => r.humidity)]
    );
  }

  // avg / min / max / count computed by PostgreSQL (index-only scan): only one row travels on the network.
  async getStats(locationId: number, { from, to }: DateRange): Promise<WeatherStats> {
    const result = await this.db.query<WeatherStats>(
      `SELECT count(*)::int AS count, avg(temperature) AS avg, min(temperature) AS min, max(temperature) AS max
       FROM weather WHERE location_id = $1 AND ${RANGE}`,
      [locationId, from ?? null, to ?? null]
    );
    return result.rows[0];
  }

  // Keyset pagination: cost is O(limit) whatever the page number (no OFFSET).
  async getPage(
    locationId: number,
    location: string,
    { from, to }: DateRange,
    limit: number,
    cursor?: string
  ): Promise<WeatherRow[]> {
    const result = await this.db.query<WeatherRow>(
      `SELECT $6::varchar AS location, date, temperature, humidity
       FROM weather
       WHERE location_id = $1 AND ${RANGE} AND date > COALESCE($4::date, '-infinity')
       ORDER BY date
       LIMIT $5`,
      [locationId, from ?? null, to ?? null, cursor ?? null, limit, location]
    );
    return result.rows;
  }

  // Server-side cursor read by batches: memory stays constant whatever the volume,
  // and each batch is serialized in one JSON.stringify call (not row by row).
  async *streamBatches(
    locationId: number,
    location: string,
    { from, to }: DateRange,
    batchSize = 2000
  ): AsyncGenerator<WeatherRow[]> {
    const client = await this.db.connect();
    const cursor = client.query(
      new Cursor<WeatherRow>(
        `SELECT $4::varchar AS location, date, temperature, humidity FROM weather
         WHERE location_id = $1 AND ${RANGE} ORDER BY date`,
        [locationId, from ?? null, to ?? null, location]
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
