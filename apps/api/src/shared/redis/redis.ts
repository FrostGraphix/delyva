import { Redis } from 'ioredis';

/** DI token for the shared ioredis client. */
export const REDIS = Symbol('REDIS');

/** Creates a Redis client with bounded retries and command timeouts. */
export function createRedis(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 2,
    commandTimeout: 2_000,
    connectTimeout: 5_000,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 2_000) + Math.floor(Math.random() * 100),
  });
}
