import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { OrderLock } from '../application/ports.js';
import { DispatchError } from '../domain/dispatch-errors.js';

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/** Lock options. */
export interface RedisOrderLockOptions {
  /** Lock lease (ms); longer than any guarded section (DB tx + ordering call). */
  readonly ttlMs: number;
  /** How long a caller waits for a busy lock before giving up with 409 (ms). */
  readonly waitMs: number;
  /** Poll interval while waiting (ms). */
  readonly retryMs: number;
}

/**
 * Per-order Redis lock (`SET dispatch:lock:<orderId> <token> NX PX`), released with a
 * compare-and-delete script so a caller never frees someone else's lease.
 * DEBT(dispatch): single-instance lock (not Redlock); fencing relies on the partial unique indexes on trips/offers — acceptable on one Redis primary.
 */
export class RedisOrderLock implements OrderLock {
  /** @param redis client @param options timings */
  constructor(
    private readonly redis: Redis,
    private readonly options: RedisOrderLockOptions = { ttlMs: 15_000, waitMs: 3_000, retryMs: 50 },
  ) {}

  /** @inheritdoc */
  async withLock<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
    const key = `dispatch:lock:${orderId}`;
    const token = randomUUID();
    await this.acquire(key, token);
    try {
      return await fn();
    } finally {
      await this.redis.eval(RELEASE, 1, key, token);
    }
  }

  private async acquire(key: string, token: string): Promise<void> {
    const deadline = Date.now() + this.options.waitMs;
    for (;;) {
      const ok = await this.redis.set(key, token, 'PX', this.options.ttlMs, 'NX');
      if (ok === 'OK') return;
      if (Date.now() >= deadline) {
        throw new DispatchError('conflict', 'This order is being assigned. Retry shortly.');
      }
      await new Promise((r) => setTimeout(r, this.options.retryMs));
    }
  }
}
