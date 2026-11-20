import type pg from 'pg';
import type { Logger } from 'pino';
import {
  DISPATCH_CONSUMED_EVENT_TYPES,
  type HandleOrderingEvent,
} from '../application/handle-ordering-event.use-case.js';

const BATCH = 50;
const POLL_MS = 1_000;

interface Row {
  id: string;
  type: string;
  payload: unknown;
}

/**
 * Outbox consumer for the dispatch context (same pattern as notifications): selects consumed
 * event types without a `dispatch_event_receipts` row, claims each by inserting the receipt in a
 * transaction and handles it; a failure rolls the claim back so the event is retried.
 * DEBT(dispatch): polls the shared outbox table — no broker yet — switch to a NATS JetStream durable consumer with the notifications consumer.
 */
export class OutboxDispatchConsumer {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  /** @param pool pg pool @param handler event handler @param logger logger */
  constructor(
    private readonly pool: pg.Pool,
    private readonly handler: HandleOrderingEvent,
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
         AND NOT EXISTS (SELECT 1 FROM dispatch_event_receipts r WHERE r.event_id = o.id)
       ORDER BY o.occurred_at LIMIT $2`,
      [DISPATCH_CONSUMED_EVENT_TYPES, BATCH],
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
        `INSERT INTO dispatch_event_receipts (event_id, event_type, outcome)
         VALUES ($1, $2, 'processing') ON CONFLICT DO NOTHING`,
        [row.id, row.type],
      );
      if (claim.rowCount === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const outcome = await this.handler.execute(row);
      const label = outcome.status === 'ignored' ? `ignored:${outcome.reason}` : 'scheduled';
      if (outcome.status === 'ignored') {
        this.logger.warn(
          { eventId: row.id, type: row.type, reason: outcome.reason },
          'dispatch event ignored',
        );
      }
      await client.query('UPDATE dispatch_event_receipts SET outcome = $2 WHERE event_id = $1', [
        row.id,
        label,
      ]);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.warn(
        { err, eventId: row.id, type: row.type },
        'dispatch event failed; will retry',
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
      this.logger.warn({ err }, 'dispatch consumer poll failed');
    } finally {
      this.running = false;
    }
  }
}
