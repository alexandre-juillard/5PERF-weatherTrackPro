import repositoryInstance, { DateRange, WeatherDataRepository } from './repository.js';
import { WeatherDataInput, WeatherRow, WeatherStats } from './dto.js';

export type Page = { rows: WeatherRow[]; nextCursor: string | null };

export class WeatherService {
  constructor(private readonly repository: WeatherDataRepository = repositoryInstance) {}

  async addData(input: WeatherDataInput): Promise<void> {
    await this.repository.upsertMany(Array.isArray(input) ? input : [input]);
  }

  // Returns null when the location is unknown (=> 404). An empty range on a known location
  // returns { count: 0, avg: null, min: null, max: null } instead of crashing.
  async getStats(location: string, range: DateRange): Promise<WeatherStats | null> {
    const stats = await this.repository.getStats(location, range);
    if (stats.count === 0 && !(await this.repository.locationExists(location))) {
      return null;
    }
    return stats;
  }

  async getPage(location: string, range: DateRange, limit: number, cursor?: string): Promise<Page | null> {
    // One extra row tells whether a next page exists without a COUNT(*)
    const rows = await this.repository.getPage(location, range, limit + 1, cursor);
    if (rows.length === 0 && !(await this.repository.locationExists(location))) {
      return null;
    }
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    return { rows, nextCursor: hasMore ? rows[rows.length - 1].date : null };
  }

  async exportData(location: string, range: DateRange): Promise<AsyncGenerator<WeatherRow[]> | null> {
    if (!(await this.repository.locationExists(location))) {
      return null;
    }
    return this.repository.streamBatches(location, range);
  }
}

export default new WeatherService();
