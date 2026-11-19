import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { EventEnvelope } from '@delyva/contracts';
import type pg from 'pg';
import type { Logger } from 'pino';
import { PG_POOL } from '../database/database.js';
import { LOGGER } from '../logging/logger.js';

/** Destination for published events (NATS JetStream in production). */
export interface EventBus {
  /** Publishes one event; must be idempotent on `event.id` downstream. */
  publish(event: EventEnvelope): Promise<void>;
}

/** DI token for the {@link EventBus}. */
export const EVENT_BUS = Symbol('EVENT_BUS');

/** Logs event metadata only (no payload); stand-in until the NATS adapter lands. */
export class LoggingEventBus implements EventBus {
  /** @param logger root logger */
  constructor(private readonly logger: Logger) {}
  /** @inheritdoc */
  publish(event: EventEnvelope): Promise<void> {
    this.logger.info({ eventId: event.id, type: event.type }, 'event published');
    return Promise.resolve();
  }
}

interface OutboxRow {
  id: string;
  type: string;
  version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  trace_id: string | null;
  occurred_at: Date;
}

const BATCH = 50;
const POLL_MS = 1_000;

/**
 * Polls unpublished outbox rows with `FOR UPDATE SKIP LOCKED` so several API pods can run it.
 * DEBT(outbox): polling publisher with a logging bus — real broker not chosen yet — add NATS JetStream adapter + LISTEN/NOTIFY wakeups.
 */
@Injectable()
export class OutboxPublisher implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  /** @param pool pg pool @param bus event bus @param logger root logger */
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** @inheritdoc */
  onApplicationBootstrap(): void {
    if (process.env.OUTBOX_PUBLISHER_DISABLED === 'true') return;
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  /** @inheritdoc */
  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Publishes one batch. Returns the number of events published. */
  async publishBatch(): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<OutboxRow>(
        'SELECT * FROM outbox_events WHERE published_at IS NULL ORDER BY occurred_at LIMIT $1 FOR UPDATE SKIP LOCKED',
        [BATCH],
      );
      for (const row of rows) await this.publishRow(client, row);
      await client.query('COMMIT');
      return rows.length;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async publishRow(client: pg.PoolClient, row: OutboxRow): Promise<void> {
    try {
      await this.bus.publish(toEnvelope(row));
      await client.query(
        'UPDATE outbox_events SET published_at = now(), attempts = attempts + 1 WHERE id = $1',
        [row.id],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown';
      await client.query(
        'UPDATE outbox_events SET attempts = attempts + 1, last_error = $2 WHERE id = $1',
        [row.id, message],
      );
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.publishBatch();
    } catch (err) {
      this.logger.warn({ err }, 'outbox publish failed');
    } finally {
      this.running = false;
    }
  }
}

function toEnvelope(row: OutboxRow): EventEnvelope {
  return {
    id: row.id,
    type: row.type,
    version: row.version,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    payload: row.payload,
    occurredAt: row.occurred_at.toISOString(),
    ...(row.trace_id ? { traceId: row.trace_id } : {}),
  };
}
