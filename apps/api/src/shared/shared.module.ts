import {
  type DynamicModule,
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import type { Logger } from 'pino';
import { ENV, type Env } from './config/env.js';
import { createDb, createPool, DB, PG_POOL } from './database/database.js';
import { ProblemExceptionFilter } from './errors/problem.filter.js';
import { HealthController } from './health/health.controller.js';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor.js';
import { LOGGER } from './logging/logger.js';
import { EVENT_BUS, LoggingEventBus, OutboxPublisher } from './outbox/outbox.publisher.js';
import { createRedis, REDIS } from './redis/redis.js';
import { buildFieldEncryptor, FIELD_ENCRYPTOR } from './crypto/field-encryption.js';
import { buildStorage } from './storage/build-storage.js';
import { STORAGE_PROVIDER } from './storage/storage.js';

/** Cross-cutting infrastructure: config, logger, Postgres, Redis, outbox, idempotency, errors, health. */
@Global()
@Module({})
export class SharedModule implements OnApplicationShutdown {
  /** @param pool pg pool @param redis redis client */
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Builds the module from a validated env and the root logger. */
  static forRoot(env: Env, logger: Logger): DynamicModule {
    return {
      module: SharedModule,
      controllers: [HealthController],
      providers: [
        { provide: ENV, useValue: env },
        { provide: LOGGER, useValue: logger },
        { provide: PG_POOL, useFactory: () => createPool(env.DATABASE_URL) },
        { provide: DB, inject: [PG_POOL], useFactory: createDb },
        { provide: REDIS, useFactory: () => createRedis(env.REDIS_URL) },
        { provide: EVENT_BUS, useFactory: () => new LoggingEventBus(logger) },
        OutboxPublisher,
        { provide: APP_FILTER, useClass: ProblemExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
        {
          provide: FIELD_ENCRYPTOR,
          useFactory: () =>
            buildFieldEncryptor({
              keys: env.FIELD_ENCRYPTION_KEYS,
              activeKid: env.FIELD_ENCRYPTION_ACTIVE_KID,
              devPepper: env.HASH_PEPPER,
            }),
        },
        { provide: STORAGE_PROVIDER, useFactory: () => buildStorage(env) },
      ],
      exports: [ENV, LOGGER, PG_POOL, DB, REDIS, EVENT_BUS, FIELD_ENCRYPTOR, STORAGE_PROVIDER],
    };
  }

  /** Closes connections on shutdown. */
  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([this.pool.end(), this.redis.quit()]);
  }
}
