import { DISPATCH_QUEUE } from '@delyva/contracts';
import { type Job, Queue, Worker } from 'bullmq';
import type { Logger } from 'pino';
import type { DispatchScheduler } from '../application/ports.js';
import type { RespondToOffer } from '../application/respond-to-offer.use-cases.js';
import type { RunDispatchRound } from '../application/run-dispatch-round.use-case.js';

/** Job payloads on the `dispatch` queue. */
export type DispatchJob =
  | { readonly kind: 'start'; readonly orderId: string }
  | { readonly kind: 'next'; readonly orderId: string; readonly afterOfferId: string }
  | { readonly kind: 'offer_timeout'; readonly offerId: string };

/** Retries cover a busy order lock or a transient DB/Redis error. */
const JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 500 },
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 7 * 86_400 },
} as const;

/** BullMQ producer. Job ids are deterministic (BullMQ forbids `:` in custom ids). */
export class BullMqDispatchScheduler implements DispatchScheduler {
  private readonly queue: Queue<DispatchJob>;

  /** @param redisUrl redis url @param prefix key prefix */
  constructor(redisUrl: string, prefix: string) {
    this.queue = new Queue<DispatchJob>(DISPATCH_QUEUE, { connection: { url: redisUrl }, prefix });
  }

  /** @inheritdoc */
  async scheduleStart(orderId: string, delayMs: number): Promise<void> {
    await this.queue.add(
      'start',
      { kind: 'start', orderId },
      { ...JOB_OPTIONS, delay: delayMs, jobId: `start_${orderId}` },
    );
  }

  /** @inheritdoc */
  async scheduleTimeout(offerId: string, delayMs: number): Promise<void> {
    await this.queue.add(
      'offer_timeout',
      { kind: 'offer_timeout', offerId },
      { ...JOB_OPTIONS, delay: delayMs, jobId: `timeout_${offerId}` },
    );
  }

  /** @inheritdoc */
  async scheduleNextRound(orderId: string, afterOfferId: string): Promise<void> {
    await this.queue.add(
      'next',
      { kind: 'next', orderId, afterOfferId },
      { ...JOB_OPTIONS, jobId: `next_${afterOfferId}` },
    );
  }

  /** Underlying queue (tests/ops). */
  get raw(): Queue<DispatchJob> {
    return this.queue;
  }

  /** Closes the connection. */
  close(): Promise<void> {
    return this.queue.close();
  }
}

/**
 * In-process BullMQ consumer for dispatch jobs.
 * DEBT(dispatch): runs inside the API process — the worker needs the DB, Redis lock and socket broadcaster — move to apps/workers once dispatch is extracted (internal endpoint or shared lib).
 */
export class DispatchWorker {
  private worker: Worker<DispatchJob> | undefined;

  /** Injected collaborators. */
  constructor(
    private readonly redisUrl: string,
    private readonly prefix: string,
    private readonly rounds: RunDispatchRound,
    private readonly offers: RespondToOffer,
    private readonly logger: Logger,
  ) {}

  /** Starts consuming. */
  start(): void {
    this.worker = new Worker<DispatchJob>(DISPATCH_QUEUE, (job) => this.process(job), {
      connection: { url: this.redisUrl },
      prefix: this.prefix,
      concurrency: 8,
    });
    this.worker.on('failed', (job, err) => {
      this.logger.warn({ err, jobId: job?.id, kind: job?.data.kind }, 'dispatch job failed');
    });
  }

  /** Handles one job (exposed for tests). */
  async process(job: Pick<Job<DispatchJob>, 'data'>): Promise<string> {
    const data = job.data;
    if (data.kind === 'offer_timeout') {
      return (await this.offers.expire(data.offerId)) ? 'expired' : 'noop';
    }
    const outcome = await this.rounds.execute(data.orderId);
    this.logger.info({ orderId: data.orderId, outcome: outcome.kind }, 'dispatch round');
    return outcome.kind;
  }

  /** Stops consuming. */
  async stop(): Promise<void> {
    await this.worker?.close();
  }
}
