import { jest } from '@jest/globals';
import { WeatherService } from '../src/weather/service.js';
import { WeatherDataRepository } from '../src/weather/repository.js';
import { Cache } from '../src/cache.js';
import { WeatherRow } from '../src/weather/dto.js';

class MemoryCache implements Cache {
  store = new Map<string, Map<string, string>>();
  async connect() {}
  async get(location: string, field: string) {
    return this.store.get(location)?.get(field) ?? null;
  }
  async set(location: string, field: string, value: string) {
    if (!this.store.has(location)) this.store.set(location, new Map());
    this.store.get(location)?.set(field, value);
  }
  async invalidate(locations: string[]) {
    for (const l of locations) this.store.delete(l);
  }
  async close() {}
}

const row = (date: string): WeatherRow => ({ location: 'Lyon', date, temperature: 1, humidity: 2 });

function fakeRepository() {
  return {
    getLocationId: jest.fn(async (name: string) => (name === 'Lyon' ? 1 : null)),
    getStats: jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { count: 2, avg: 10, min: 5, max: 15 };
    }),
    getPage: jest.fn(async (_id: number, _name: string, _range: unknown, limit: number) =>
      ['2024-01-01', '2024-01-02', '2024-01-03'].slice(0, limit).map(row)
    ),
    upsertMany: jest.fn(async () => undefined),
  };
}

const build = () => {
  const repository = fakeRepository();
  const cache = new MemoryCache();
  const service = new WeatherService(repository as unknown as WeatherDataRepository, cache);
  return { repository, cache, service };
};

describe('WeatherService', () => {
  it('returns null for an unknown location', async () => {
    const { service } = build();
    expect(await service.getStats('Atlantis', {})).toBeNull();
    expect(await service.getPage('Atlantis', {}, 10)).toBeNull();
    expect(await service.exportData('Atlantis', {})).toBeNull();
  });

  it('serves the second identical request from the cache', async () => {
    const { service, repository } = build();
    expect(await service.getStats('Lyon', { from: '2024-01-01' })).toEqual({ count: 2, avg: 10, min: 5, max: 15 });
    await service.getStats('Lyon', { from: '2024-01-01' });
    expect(repository.getStats).toHaveBeenCalledTimes(1);
  });

  it('shares one database query between concurrent identical misses (single-flight)', async () => {
    const { service, repository } = build();
    await Promise.all(Array.from({ length: 20 }, () => service.getStats('Lyon', {})));
    expect(repository.getStats).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cached entries of a location on write', async () => {
    const { service, repository } = build();
    await service.getStats('Lyon', {});
    await service.addData({ location: 'Lyon', date: '2024-01-01', temperature: 3, humidity: 4 });
    await service.getStats('Lyon', {});
    expect(repository.upsertMany).toHaveBeenCalledWith([
      { location: 'Lyon', date: '2024-01-01', temperature: 3, humidity: 4 },
    ]);
    expect(repository.getStats).toHaveBeenCalledTimes(2);
  });

  it('returns the next cursor only when another page exists', async () => {
    const { service } = build();
    const first = await service.getPage('Lyon', {}, 2);
    expect(JSON.parse(first?.body ?? '')).toHaveLength(2);
    expect(first?.nextCursor).toBe('2024-01-02');
    const all = await service.getPage('Lyon', {}, 3);
    expect(all?.nextCursor).toBeNull();
  });
});
