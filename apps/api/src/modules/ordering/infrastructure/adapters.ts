import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  type AutoRejectJob,
  IntentFailedPayloadSchema,
  IntentSucceededPayloadSchema,
  ORDERING_QUEUES,
  PAYMENTS_EVENTS,
} from '@delyva/contracts';
import { Queue, Worker } from 'bullmq';
import type pg from 'pg';
import type { Logger } from 'pino';
import type { AutoRejectOrder } from '../application/order-commands.use-cases.js';
import type { HandlePaymentEvent } from '../application/payment-events.use-case.js';
import type { AutoRejectScheduler, OrderCodes } from '../application/ports.js';

/**
 * Delivery OTP / pickup code derived with HMAC-SHA256 from a server secret, so the plaintext is
 * never stored: the DB keeps only a second HMAC (hash) used for constant-time verification.
 */
export class HmacOrderCodes implements OrderCodes {
  /** @param secret server-side pepper (>= 32 chars) */
  constructor(private readonly secret: string) {}

  private code(orderId: string, purpose: string): string {
    const n = createHmac('sha256', this.secret)
      .update(`order-code:${purpose}:${orderId}`)
      .digest()
      .readUInt32BE(0);
    return String(n % 10_000).padStart(4, '0');
  }

  /** @inheritdoc */
  deliveryOtp(orderId: string): string {
    return this.code(orderId, 'delivery');
  }

  /** @inheritdoc */
  pickupCode(orderId: string): string {
    return this.code(orderId, 'pickup');
  }

  /** @inheritdoc */
  hash(orderId: string, purpose: 'delivery' | 'pickup', code: string): string {
    return createHmac('sha256', this.secret)
      .update(`order-code-hash:${purpose}:${orderId}:${code}`)
      .digest('hex');
  }

  /** @inheritdoc */
  verify(orderId: string, purpose: 'delivery' | 'pickup', code: string, hash: string): boolean {
    const a = Buffer.from(this.hash(orderId, purpose, code), 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

/** BullMQ delayed jobs for vendor timeouts (`jobId = orderId`, so scheduling is idempotent). */
export class BullMqAutoRejectScheduler implements AutoRejectScheduler {
  private readonly queue: Queue<AutoRejectJob>;

  /** @param redisUrl redis url @param prefix BullMQ key prefix */
  constructor(redisUrl: string, prefix: string) {
    this.queue = new Queue<AutoRejectJob>(ORDERING_QUEUES.autoReject, {
      connection: { url: redisUrl },
      prefix,
    });
  }

  /** @inheritdoc */
  async schedule(orderId: string, delayMs: number): Promise<void> {
    await this.queue.add(
      'auto-reject',
      { orderId },
      {
        jobId: orderId,
        delay: delayMs,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 7 * 86_400 },
      },
    );
  }

  /** @inheritdoc */
  async cancel(orderId: string): Promise<void> {
    const job = await this.queue.getJob(orderId);
    if (job && (await job.isDelayed())) await job.remove();
  }

  /** Closes the connection. */
  close(): Promise<void> {
    return this.queue.close();
  }
}

/**
 * In-process consumer of the auto-reject queue.
 * DEBT(ordering): runs inside the API process — workers have no DB access yet — move to apps/workers calling an internal endpoint.
 */
export function startAutoRejectWorker(
  redisUrl: string,
  prefix: string,
  useCase: AutoRejectOrder,
  logger: Logger,
): Worker<AutoRejectJob> {
  const worker = new Worker<AutoRejectJob>(
    ORDERING_QUEUES.autoReject,
    async (job) => {
      const status = await useCase.execute(job.data.orderId);
      logger.info({ orderId: job.data.orderId, status }, 'auto-reject check done');
    },
    { connection: { url: redisUrl }, prefix },
  );
  worker.on('failed', (job, err) => { logger.warn({ err, orderId: job?.data.orderId }, 'auto-reject job failed'); },
  );
  return worker;
}

const CONSUMED = [PAYMENTS_EVENTS.intentSucceeded, PAYMENTS_EVENTS.intentFailed];
const UNKNOWN_ORDER_GRACE_MS = 120_000;

interface Row {
  id: string;
  type: string;
  payload: unknown;
  occurred_at: Date;
}

/**
 * Outbox consumer for `payments.intent.{succeeded,failed}` (receipt-table claim, like
 * notifications). Events for orders not (yet) visible are retried for a grace period.
 * DEBT(outbox): polls the shared outbox table — no broker yet — switch to a NATS JetStream durable consumer.
 */
export class OutboxPaymentEventsConsumer {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  /** @param pool pg pool @param handler use case @param logger logger */
  constructor(
    private readonly pool: pg.Pool,
    private readonly handler: HandlePaymentEvent,
    private readonly logger: Logger,
  ) {}

  /** Starts polling. */
  start(): void {
    this.timer = setInterval(() => void this.tick(), 1_000);
    this.timer.unref();
  }

  /** Stops polling. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One batch; returns the number of events applied/ignored. */
  async consumeBatch(): Promise<number> {
    const { rows } = await this.pool.query<Row>(
      `SELECT o.id, o.type, o.payload, o.occurred_at FROM outbox_events o
       WHERE o.type = ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM ordering_event_receipts r WHERE r.event_id = o.id)
       ORDER BY o.occurred_at LIMIT 50`,
      [CONSUMED],
    );
    let n = 0;
    for (const row of rows) if (await this.consumeOne(row)) n++;
    return n;
  }

  private async consumeOne(row: Row): Promise<boolean> {
    const schema =
      row.type === PAYMENTS_EVENTS.intentFailed
        ? IntentFailedPayloadSchema
        : IntentSucceededPayloadSchema;
    const parsed = schema.safeParse(row.payload);
    try {
      const outcome = parsed.success
        ? await this.handler.execute(row.type, parsed.data)
        : 'ignored';
      if (outcome === 'retry' && Date.now() - row.occurred_at.getTime() < UNKNOWN_ORDER_GRACE_MS)
        return false;
      const res = await this.pool.query(
        `INSERT INTO ordering_event_receipts (event_id, event_type, outcome) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [row.id, row.type, outcome === 'retry' ? 'ignored:unknown_order' : outcome],
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      this.logger.warn(
        { err, eventId: row.id, type: row.type },
        'payment event failed; will retry',
      );
      return false;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.consumeBatch();
    } catch (err) {
      this.logger.warn({ err }, 'ordering payment-event poll failed');
    } finally {
      this.running = false;
    }
  }
}
