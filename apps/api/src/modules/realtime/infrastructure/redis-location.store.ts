import type { RiderLocation } from '@delyva/contracts';
import type { Redis } from 'ioredis';
import { slidingWindowHit } from '../../../shared/rate-limit/sliding-window.js';
import type {
  LocationRateLimiter,
  LocationStore,
  NearbyRider,
  RiderPosition,
} from '../application/ports.js';

/** GEO set of all rider positions. */
export const RIDER_GEO_KEY = 'riders:locations';
const LAST_TTL_SECONDS = 120;
const ACTIVE_ORDER_TTL_SECONDS = 6 * 3600;

/**
 * Redis implementation: `GEOADD riders:locations`, a per-rider last-fix hash (TTL 2 min, also
 * guards against out-of-order fixes) and a per-rider active-order key.
 * DEBT(realtime): stale members stay in the GEO set after riders go offline — prune by last-fix TTL in a sweeper job.
 */
export class RedisLocationStore implements LocationStore {
  /** @param redis client @param prefix key prefix (tests) */
  constructor(
    private readonly redis: Redis,
    private readonly prefix = '',
  ) {}

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  /** @inheritdoc */
  async write(riderId: string, fix: RiderLocation): Promise<boolean> {
    const lastKey = this.key(`rider:${riderId}:last`);
    const prevTs = Number(await this.redis.hget(lastKey, 'ts'));
    if (Number.isFinite(prevTs) && prevTs >= fix.ts) return false;
    await this.redis
      .multi()
      .geoadd(this.key(RIDER_GEO_KEY), fix.lng, fix.lat, riderId)
      .hset(lastKey, {
        lat: fix.lat,
        lng: fix.lng,
        heading: fix.heading ?? '',
        ts: fix.ts,
      })
      .expire(lastKey, LAST_TTL_SECONDS)
      .exec();
    return true;
  }

  /** @inheritdoc */
  async last(riderId: string): Promise<RiderPosition | null> {
    const h = await this.redis.hgetall(this.key(`rider:${riderId}:last`));
    if (!h.ts) return null;
    return {
      lat: Number(h.lat),
      lng: Number(h.lng),
      heading: h.heading ? Number(h.heading) : null,
      ts: Number(h.ts),
    };
  }

  /** @inheritdoc */
  async near(lat: number, lng: number, radiusM: number, limit: number): Promise<NearbyRider[]> {
    const raw = (await this.redis.geosearch(
      this.key(RIDER_GEO_KEY),
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      radiusM,
      'm',
      'ASC',
      'COUNT',
      limit,
      'WITHDIST',
    )) as [string, string][];
    return raw.map(([riderId, dist]) => ({ riderId, distanceM: Number(dist) }));
  }

  /** @inheritdoc */
  activeOrderOf(riderId: string): Promise<string | null> {
    return this.redis.get(this.key(`rider:${riderId}:active_order`));
  }

  /** @inheritdoc */
  async setActiveOrder(riderId: string, orderId: string | null): Promise<void> {
    const k = this.key(`rider:${riderId}:active_order`);
    if (orderId === null) await this.redis.del(k);
    else await this.redis.set(k, orderId, 'EX', ACTIVE_ORDER_TTL_SECONDS);
  }
}

/** Redis sliding-window limiter adapter. */
export class RedisLocationRateLimiter implements LocationRateLimiter {
  /** @param redis client */
  constructor(private readonly redis: Redis) {}

  /** @inheritdoc */
  async hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    return (await slidingWindowHit(this.redis, key, limit, windowSeconds)).allowed;
  }
}
