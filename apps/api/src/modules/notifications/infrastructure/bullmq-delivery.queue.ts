import { NOTIFICATION_QUEUES, type NotificationJob } from '@delyva/contracts';
import { Queue } from 'bullmq';
import type { DeliveryQueue } from '../application/ports.js';

/** Retry policy shared with workers: 5 attempts, custom jittered exponential backoff. */
export const DELIVERY_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'jittered' },
  removeOnComplete: { age: 86_400, count: 10_000 },
  removeOnFail: { age: 7 * 86_400 },
} as const;

/** BullMQ producer for the `notifications` queue. */
export class BullMqDeliveryQueue implements DeliveryQueue {
  private readonly queue: Queue;

  /** @param redisUrl redis url @param prefix key prefix (tests isolate with their own) */
  constructor(redisUrl: string, prefix = 'bull') {
    this.queue = new Queue(NOTIFICATION_QUEUES.delivery, { connection: { url: redisUrl }, prefix });
  }

  /** @inheritdoc */
  async enqueue(jobId: string, job: NotificationJob): Promise<void> {
    await this.queue.add(job.kind, job, { ...DELIVERY_JOB_OPTIONS, jobId });
  }

  /** Underlying queue (tests/ops). */
  get raw(): Queue {
    return this.queue;
  }

  /** Closes the connection. */
  close(): Promise<void> {
    return this.queue.close();
  }
}
