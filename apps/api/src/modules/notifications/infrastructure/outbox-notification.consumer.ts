import type pg from 'pg';
import type { Logger } from 'pino';
import type { HandleDomainEvent } from '../application/handle-domain-event.use-case.js';
import { CONSUMED_EVENT_TYPES } from '../domain/event-mappings.js';

const BATCH = 50;
const POLL_MS = 1_000;

interface Row {
  id: string;
  type: string;
  payload: unknown;
}

/**
 * Independent outbox consumer for the notifications context: reads `outbox_events` of the
 * consumed types that have no receipt yet, claims each by inserting a receipt row, and handles
 * it. Delivery jobs use deterministic ids so a crash between enqueue and commit cannot duplicate.
 * DEBT(notifications): polls the shared outbox table with NOT EXISTS — no broker yet — switch to a NATS JetStream durable consumer.
 */
export class OutboxNotificationConsumer {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  /** @param pool pg pool @param handler event handler @param logger logger */
  constructor(
    private readonly pool: pg.Pool,
    private readonly handler: HandleDomainEvent,
    private readonly logger: Logger,
  ) {}

  /** Starts polling. */
  start(): void {
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  /** Stops polling. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Processes one batch; returns the number of events claimed. */
  async consumeBatch(): Promise<number> {
    const { rows } = await this.pool.query<Row>(
      `SELECT o.id, o.type, o.payload FROM outbox_events o
       WHERE o.type = ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM notification_event_receipts r WHERE r.event_id = o.id)
       ORDER BY o.occurred_at LIMIT $2`,
      [CONSUMED_EVENT_TYPES, BATCH],
    );
    let claimed = 0;
    for (const row of rows) if (await this.consumeOne(row)) claimed++;
    return claimed;
  }

  private async consumeOne(row: Row): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const claim = await client.query(
        `INSERT INTO notification_event_receipts (event_id, event_type, outcome)
         VALUES ($1, $2, 'processing') ON CONFLICT DO NOTHING`,
        [row.id, row.type],
      );
      if (claim.rowCount === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const outcome = await this.handler.execute(row);
      const label = outcome.status === 'ignored' ? `ignored:${outcome.reason}` : 'notified';
      if (outcome.status === 'ignored') {
        this.logger.warn(
          { eventId: row.id, type: row.type, reason: outcome.reason },
          'event ignored',
        );
      }
      await client.query(
        'UPDATE notification_event_receipts SET outcome = $2 WHERE event_id = $1',
        [row.id, label],
      );
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.warn(
        { err, eventId: row.id, type: row.type },
        'notification event failed; will retry',
      );
      return false;
    } finally {
      client.release();
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.consumeBatch();
    } catch (err) {
      this.logger.warn({ err }, 'notification consumer poll failed');
    } finally {
      this.running = false;
    }
  }
}
