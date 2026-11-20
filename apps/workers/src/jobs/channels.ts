import type { NotificationJob } from '@delyva/contracts';
import type { Logger } from 'pino';
import { PermanentDeliveryError, type PushChannel, type TextChannel } from './notification.job.js';

type PushJob = Extract<NotificationJob, { kind: 'push' }>;

/** Expo push configuration. */
export interface ExpoPushConfig {
  /** e.g. https://exp.host/--/api/v2/push/send (from env). */
  readonly url: string;
  /** Optional Expo access token (enhanced push security). */
  readonly accessToken?: string | undefined;
  readonly timeoutMs?: number;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Expo Push Service adapter (HTTP API, no SDK dependency).
 * DEBT(notifications): push receipts are not polled and DeviceNotRegistered tokens are not disabled in `push_devices` — workers have no DB access — add a receipts job + an API endpoint/event to disable tokens.
 */
export class ExpoPushChannel implements PushChannel {
  /** @param config expo config @param fetchImpl injectable fetch */
  constructor(
    private readonly config: ExpoPushConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** @inheritdoc */
  async send(job: PushJob): Promise<void> {
    const messages = job.tokens.map((to) => ({
      to,
      title: job.title,
      body: job.body,
      data: job.data,
      sound: 'default',
      priority: 'high',
    }));
    const response = await this.fetchImpl(this.config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(this.config.accessToken ? { authorization: `Bearer ${this.config.accessToken}` } : {}),
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
    });
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      throw new PermanentDeliveryError(`expo rejected request with ${String(response.status)}`);
    }
    if (!response.ok) throw new Error(`expo push failed with ${String(response.status)}`);
    const { data } = (await response.json()) as { data?: ExpoTicket[] };
    assertTickets(data ?? []);
  }
}

function assertTickets(tickets: readonly ExpoTicket[]): void {
  const errors = tickets.filter((t) => t.status === 'error');
  if (errors.length === 0 || errors.length < tickets.length) return;
  const permanent = errors.every((t) => t.details?.error === 'DeviceNotRegistered');
  const reason = errors[0]?.details?.error ?? 'unknown';
  if (permanent) throw new PermanentDeliveryError(`expo tickets failed: ${reason}`);
  throw new Error(`expo tickets failed: ${reason}`);
}

/** Termii configuration (from env). */
export interface TermiiConfig {
  readonly apiKey: string;
  readonly senderId: string;
  readonly baseUrl: string;
  readonly timeoutMs?: number;
}

/** Termii SMS adapter for transactional (non-OTP) text. Never logs the phone or text. */
export class TermiiSmsChannel implements TextChannel {
  /** @param config termii config @param fetchImpl injectable fetch */
  constructor(
    private readonly config: TermiiConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** @inheritdoc */
  async send(phone: string, text: string): Promise<void> {
    const response = await this.fetchImpl(`${this.config.baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 5_000),
      body: JSON.stringify({
        api_key: this.config.apiKey,
        to: phone.replace(/^\+/, ''),
        from: this.config.senderId,
        sms: text,
        type: 'plain',
        channel: 'generic',
      }),
    });
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new PermanentDeliveryError(`termii rejected with ${String(response.status)}`);
    }
    if (!response.ok) throw new Error(`termii send failed with ${String(response.status)}`);
  }
}

/**
 * WhatsApp adapter stub. No provider is contracted yet, so jobs fail permanently and land in the
 * DLQ (WhatsApp is opt-in and off by default, so none are produced today).
 * DEBT(notifications): WhatsApp Business provider not chosen — needs vendor decision — implement adapter.
 */
export class WhatsAppStubChannel implements TextChannel {
  /** @inheritdoc */
  send(): Promise<void> {
    return Promise.reject(new PermanentDeliveryError('whatsapp channel not configured'));
  }
}

/** Development channel: logs metadata only (never phone, token or text). */
export class LogChannel implements PushChannel, TextChannel {
  /** @param logger logger @param name channel name */
  constructor(
    private readonly logger: Logger,
    private readonly name: string,
  ) {}

  /** @inheritdoc */
  send(job?: unknown): Promise<void> {
    const id =
      typeof job === 'object' && job !== null && 'notificationId' in job
        ? String(job.notificationId)
        : undefined;
    this.logger.info(
      { channel: this.name, notificationId: id },
      'notification delivered (log channel)',
    );
    return Promise.resolve();
  }
}
