import {
  type DeadLetterJob,
  NOTIFICATION_QUEUES,
  type NotificationJob,
  NotificationJobSchema,
} from '@delyva/contracts';
import { UnrecoverableError } from 'bullmq';

/** Queue names consumed by this worker process. */
export const QUEUES = NOTIFICATION_QUEUES;

/** A delivery failure that retrying cannot fix (bad token, invalid number, bad payload). */
export class PermanentDeliveryError extends Error {
  /** @param message safe reason (no PII) */
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDeliveryError';
  }
}

/** Push delivery port (Expo). */
export interface PushChannel {
  /** Sends to every token; throws PermanentDeliveryError when all tokens are permanently invalid. */
  send(job: Extract<NotificationJob, { kind: 'push' }>): Promise<void>;
}

/** Text delivery port (SMS / WhatsApp). */
export interface TextChannel {
  /** Sends a plain text message to an E.164 phone. */
  send(phone: string, text: string): Promise<void>;
}

/** Channels injected into the processor. */
export interface DeliveryChannels {
  readonly push: PushChannel;
  readonly sms: TextChannel;
  readonly whatsapp: TextChannel;
}

/** Outcome reported back to BullMQ (no PII). */
export interface DeliveryResult {
  readonly delivered: true;
  readonly kind: NotificationJob['kind'];
  readonly notificationId: string;
}

/**
 * Processes one delivery job. Invalid payloads and permanent provider errors become
 * `UnrecoverableError` (no retries → dead-letter); anything else is retried with backoff.
 */
export async function processNotification(
  data: unknown,
  channels: DeliveryChannels,
): Promise<DeliveryResult> {
  const parsed = NotificationJobSchema.safeParse(data);
  if (!parsed.success) throw new UnrecoverableError('invalid notification job payload');
  const job = parsed.data;
  try {
    if (job.kind === 'push') await channels.push.send(job);
    else await channels[job.kind].send(job.phone, job.text);
  } catch (err) {
    if (err instanceof PermanentDeliveryError) throw new UnrecoverableError(err.message);
    throw err;
  }
  return { delivered: true, kind: job.kind, notificationId: job.notificationId };
}

/** Backoff tuning. */
export const BACKOFF = { baseMs: 2_000, capMs: 5 * 60_000 } as const;

/**
 * "Full jitter" exponential backoff: uniform in [0, min(cap, base·2^(n-1))].
 * Spreads retries so a provider outage does not cause synchronized retry storms.
 */
export function jitteredBackoff(
  attemptsMade: number,
  random: () => number = Math.random,
  tuning: { baseMs: number; capMs: number } = BACKOFF,
): number {
  const ceiling = Math.min(tuning.capMs, tuning.baseMs * 2 ** Math.max(0, attemptsMade - 1));
  return Math.floor(random() * ceiling);
}

/** Minimal failed-job view. */
export interface FailedJobView {
  readonly id?: string | undefined;
  readonly name: string;
  readonly data: unknown;
  readonly attemptsMade: number;
  readonly opts: { readonly attempts?: number | undefined };
}

/** True when the job will not be retried again (attempts exhausted or unrecoverable). */
export function isFinalFailure(job: FailedJobView, err: Error): boolean {
  return err instanceof UnrecoverableError || err.name === 'UnrecoverableError'
    ? true
    : job.attemptsMade >= (job.opts.attempts ?? 1);
}

/** Builds the dead-letter record for a terminally failed job. */
export function toDeadLetter(job: FailedJobView, err: Error, now: Date): DeadLetterJob {
  return {
    queue: QUEUES.delivery,
    jobId: job.id ?? 'unknown',
    name: job.name,
    attemptsMade: job.attemptsMade,
    failedReason: err.message.slice(0, 500),
    data: job.data,
    failedAt: now.toISOString(),
  };
}
