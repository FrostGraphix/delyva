import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

/** Outcome of a rate-limit check. */
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * Redis sorted-set sliding window. Records the hit and returns whether it is within `limit`
 * hits over the last `windowSeconds`. Rejected hits are not counted.
 */
export async function slidingWindowHit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  const windowStart = nowMs - windowSeconds * 1000;
  const results = await redis
    .multi()
    .zremrangebyscore(key, '-inf', String(windowStart))
    .zcard(key)
    .zrange(key, '0', '0', 'WITHSCORES')
    .exec();
  const count = Number(results?.[1]?.[1] ?? 0);
  if (count >= limit) {
    const oldest = Number((results?.[2]?.[1] as string[] | undefined)?.[1] ?? nowMs);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowSeconds * 1000 - nowMs) / 1000)),
    };
  }
  await redis
    .multi()
    .zadd(key, nowMs, `${String(nowMs)}:${randomUUID()}`)
    .expire(key, windowSeconds)
    .exec();
  return { allowed: true, retryAfterSeconds: 0 };
}
