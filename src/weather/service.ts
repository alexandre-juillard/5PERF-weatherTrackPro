import repositoryInstance, { DateRange, WeatherDataRepository } from './repository.js';
import cacheInstance, { Cache } from '../cache.js';
import { WeatherData, WeatherDataInput, WeatherRow, WeatherStats } from './dto.js';

// body = serialized JSON array, kept as a string so that a cache hit is sent without re-serialization
export type Page = { body: string; nextCursor: string | null };

export class WeatherService {
  // Single-flight: concurrent identical cache misses share one database query (no cache stampede)
  private readonly inflight = new Map<string, Promise<string | null>>();

  constructor(
    private readonly repository: WeatherDataRepository = repositoryInstance,
    private readonly cache: Cache = cacheInstance
  ) {}

  private async cached(location: string, field: string, load: () => Promise<string | null>): Promise<string | null> {
    const hit = await this.cache.get(location, field);
    if (hit !== null) return hit;

    const flightKey = `${location}\u0000${field}`;
    let pending = this.inflight.get(flightKey);
    if (!pending) {
      pending = load()
        .then((value) => {
          if (value !== null) void this.cache.set(location, field, value);
          return value;
        })
        .finally(() => this.inflight.delete(flightKey));
      this.inflight.set(flightKey, pending);
    }
    return pending;
  }

  async addData(input: WeatherDataInput): Promise<void> {
    const data: WeatherData[] = Array.isArray(input) ? input : [input];
    await this.repository.upsertMany(data);
    await this.cache.invalidate([...new Set(data.map((d) => d.location))]);
  }

  // Returns null when the location is unknown (=> 404). An empty range on a known location
  // returns { count: 0, avg: null, min: null, max: null } instead of crashing.
  async getStats(location: string, { from, to }: DateRange): Promise<WeatherStats | null> {
    const json = await this.cached(location, `stats|${from ?? ''}|${to ?? ''}`, async () => {
      const locationId = await this.repository.getLocationId(location);
      if (locationId === null) return null;
      return JSON.stringify(await this.repository.getStats(locationId, { from, to }));
    });
    return json === null ? null : (JSON.parse(json) as WeatherStats);
  }

  async getPage(location: string, { from, to }: DateRange, limit: number, cursor?: string): Promise<Page | null> {
    const field = `page|${from ?? ''}|${to ?? ''}|${limit}|${cursor ?? ''}`;
    const value = await this.cached(location, field, async () => {
      const locationId = await this.repository.getLocationId(location);
      if (locationId === null) return null;
      // One extra row tells whether a next page exists without a COUNT(*)
      const rows = await this.repository.getPage(locationId, location, { from, to }, limit + 1, cursor);
      const hasMore = rows.length > limit;
      if (hasMore) rows.pop();
      const nextCursor = hasMore ? rows[rows.length - 1].date : '';
      return `${nextCursor}\n${JSON.stringify(rows)}`;
    });
    if (value === null) return null;
    const separator = value.indexOf('\n');
    return { nextCursor: value.slice(0, separator) || null, body: value.slice(separator + 1) };
  }

  async exportData(location: string, range: DateRange): Promise<AsyncGenerator<WeatherRow[]> | null> {
    const locationId = await this.repository.getLocationId(location);
    if (locationId === null) return null;
    return this.repository.streamBatches(locationId, location, range);
  }
}

export default new WeatherService();
