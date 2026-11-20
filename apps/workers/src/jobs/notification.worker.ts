import { Queue, Worker } from 'bullmq';
import type { Logger } from 'pino';
import {
  type DeliveryChannels,
  isFinalFailure,
  jitteredBackoff,
  processNotification,
  QUEUES,
  toDeadLetter,
} from './notification.job.js';

/** Worker wiring options. */
export interface NotificationWorkerOptions {
  readonly redisUrl: string;
  /** BullMQ key prefix (must match the API producer). */
  readonly prefix: string;
  readonly channels: DeliveryChannels;
  readonly logger: Logger;
  readonly concurrency: number;
  /** Override backoff (tests use a tiny base). */
  readonly backoff?: (attemptsMade: number) => number;
}

/** Running worker plus its dead-letter queue. */
export interface NotificationWorker {
  readonly worker: Worker;
  readonly deadLetters: Queue;
  /** Closes both. */
  close(): Promise<void>;
}

/**
 * Starts the `notifications` consumer: retries use jittered exponential backoff (job option
 * `backoff: { type: 'jittered' }`), and terminal failures are copied to `notifications-dlq`
 * for inspection and replay.
 */
export function startNotificationWorker(opts: NotificationWorkerOptions): NotificationWorker {
  const connection = { url: opts.redisUrl };
  const deadLetters = new Queue(QUEUES.deadLetter, { connection, prefix: opts.prefix });
  const backoff = opts.backoff ?? ((n: number) => jitteredBackoff(n));
  const worker = new Worker(
    QUEUES.delivery,
    (job) => processNotification(job.data, opts.channels),
    {
      connection,
      prefix: opts.prefix,
      concurrency: opts.concurrency,
      settings: { backoffStrategy: (attemptsMade: number) => backoff(attemptsMade) },
    },
  );
  worker.on('failed', (job, err) => {
    if (!job) return;
    const final = isFinalFailure(job, err);
    opts.logger.warn(
      { jobId: job.id, kind: job.name, attempts: job.attemptsMade, final, err: err.message },
      'notification job failed',
    );
    if (!final) return;
    const record = toDeadLetter(job, err, new Date());
    deadLetters
      .add('dead-letter', record, { jobId: `dlq_${record.jobId}`, removeOnComplete: false })
      .catch((dlqErr: unknown) => {
        opts.logger.error({ jobId: job.id, err: dlqErr }, 'dead-letter enqueue failed');
      });
  });
  return {
    worker,
    deadLetters,
    close: async () => {
      await worker.close();
      await deadLetters.close();
    },
  };
}
