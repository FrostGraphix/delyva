import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Health } from '@delyva/contracts';
import type { Response } from 'express';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { PG_POOL } from '../database/database.js';
import { REDIS } from '../redis/redis.js';

async function probe(fn: () => Promise<unknown>, timeoutMs = 1_500): Promise<'up' | 'down'> {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error('timeout'));
        }, timeoutMs),
      ),
    ]);
    return 'up';
  } catch {
    return 'down';
  }
}

/** Liveness and readiness probes. */
@Controller()
export class HealthController {
  /** @param pool pg pool @param redis redis client */
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: process is up. */
  @Get('healthz')
  healthz(): Health {
    return { status: 'ok' };
  }

  /** Readiness: Postgres and Redis reachable; 503 otherwise. */
  @Get('readyz')
  async readyz(@Res({ passthrough: true }) res: Response): Promise<Health> {
    const [postgres, redis] = await Promise.all([
      probe(() => this.pool.query('SELECT 1')),
      probe(() => this.redis.ping()),
    ]);
    const ok = postgres === 'up' && redis === 'up';
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'degraded', checks: { postgres, redis } };
  }
}
