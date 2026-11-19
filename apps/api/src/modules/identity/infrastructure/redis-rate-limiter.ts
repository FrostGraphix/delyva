import type { Redis } from 'ioredis';
import { slidingWindowHit } from '../../../shared/rate-limit/sliding-window.js';
import type { RateLimiter } from '../application/ports.js';

/** Redis sliding-window adapter for {@link RateLimiter}. */
export class RedisRateLimiter implements RateLimiter {
  /** @param redis shared redis */
  constructor(private readonly redis: Redis) {}

  /** @inheritdoc */
  hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    return slidingWindowHit(this.redis, key, limit, windowSeconds);
  }
}
