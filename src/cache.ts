import { Redis } from 'ioredis';
import config from 'config';
import logger from './logger.js';

type CacheConfig = { enabled: boolean; redisUrl: string; ttlSeconds: number; commandTimeoutMs: number };
const cacheConfig = config.get<CacheConfig>('cache');

export type CacheResult = 'hit' | 'miss' | 'error';

export interface Cache {
  connect(): Promise<void>;
  // Entries are grouped by location so that a write invalidates all of them in O(1)
  get(location: string, field: string): Promise<string | null>;
  set(location: string, field: string, value: string): Promise<void>;
  invalidate(locations: string[]): Promise<void>;
  close(): Promise<void>;
  onResult?: (result: CacheResult) => void;
}

const key = (location: string) => `wt:loc:${location}`;

export class RedisCache implements Cache {
  onResult?: (result: CacheResult) => void;
  private lastErrorLog = 0;

  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number
  ) {}

  // The cache is an optimization: any Redis failure falls back to the database.
  private failed(error: unknown) {
    this.onResult?.('error');
    if (Date.now() - this.lastErrorLog > 10_000) {
      this.lastErrorLog = Date.now();
      logger.warn({ err: error }, 'Cache unavailable, falling back to the database');
    }
  }

  async connect(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      this.failed(error); // the API starts anyway, ioredis keeps retrying in the background
    }
  }

  async get(location: string, field: string): Promise<string | null> {
    try {
      const value = await this.redis.hget(key(location), field);
      this.onResult?.(value === null ? 'miss' : 'hit');
      return value;
    } catch (error) {
      this.failed(error);
      return null;
    }
  }

  async set(location: string, field: string, value: string): Promise<void> {
    try {
      // TTL set on the first entry only: the whole location expires at once
      await this.redis.multi().hset(key(location), field, value).expire(key(location), this.ttlSeconds, 'NX').exec();
    } catch (error) {
      this.failed(error);
    }
  }

  async invalidate(locations: string[]): Promise<void> {
    if (locations.length === 0) return;
    try {
      await this.redis.unlink(...locations.map(key));
    } catch (error) {
      this.failed(error);
    }
  }

  async close(): Promise<void> {
    this.redis.disconnect();
  }
}

export class NoCache implements Cache {
  async connect() {}
  async get() {
    return null;
  }
  async set() {}
  async invalidate() {}
  async close() {}
}

export function createCache(): Cache {
  if (!cacheConfig.enabled) return new NoCache();
  const redis = new Redis(cacheConfig.redisUrl, {
    lazyConnect: true, // connected explicitly at worker startup (not by a simple import)
    // Fail fast instead of queuing commands while Redis is down
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    commandTimeout: cacheConfig.commandTimeoutMs,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  redis.on('error', () => undefined); // reported by RedisCache.failed()
  return new RedisCache(redis, cacheConfig.ttlSeconds);
}

export default createCache();
