import { z } from 'zod';

/** Queue names consumed by this worker process. */
export const QUEUES = { notifications: 'notifications' } as const;

/** Payload of a `notifications` job. Contains ids only, never PII. */
export const NotificationJobSchema = z.strictObject({
  userId: z.uuid(),
  template: z.enum(['welcome', 'order_update']),
});
/** Payload of a `notifications` job. */
export type NotificationJob = z.infer<typeof NotificationJobSchema>;

/** Outcome reported back to BullMQ. */
export interface NotificationResult {
  readonly delivered: boolean;
  readonly template: NotificationJob['template'];
}

/** Port to the delivery channel (push/SMS), injected for tests. */
export interface NotificationChannel {
  /** Delivers a templated notification to a user. */
  send(userId: string, template: NotificationJob['template']): Promise<void>;
}

/**
 * Processes one notification job: validates the payload, then delivers it.
 * Invalid payloads throw so BullMQ retries/dead-letters them.
 */
export async function processNotification(
  data: unknown,
  channel: NotificationChannel,
): Promise<NotificationResult> {
  const job = NotificationJobSchema.parse(data);
  await channel.send(job.userId, job.template);
  return { delivered: true, template: job.template };
}
