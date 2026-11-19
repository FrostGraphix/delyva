import type { Redis } from 'ioredis';
import type { SmsSender } from '../application/ports.js';

/** Termii configuration (from env; never hardcoded). */
export interface TermiiConfig {
  readonly apiKey: string;
  readonly senderId: string;
  readonly baseUrl: string;
  readonly timeoutMs?: number;
}

/**
 * Termii SMS adapter (POST /api/sms/send).
 * DEBT(notifications): no retry/circuit breaker or WhatsApp fallback yet — Phase 0 scope — wrap with a resilience policy in Phase 1.
 */
export class TermiiSmsSender implements SmsSender {
  /** @param config Termii config @param fetchImpl injectable fetch for tests */
  constructor(
    private readonly config: TermiiConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** @inheritdoc */
  async sendOtp(phone: string, code: string): Promise<void> {
    const response = await this.fetchImpl(`${this.config.baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 5_000),
      body: JSON.stringify({
        api_key: this.config.apiKey,
        to: phone.replace(/^\+/, ''),
        from: this.config.senderId,
        sms: `Your Delyva code is ${code}. It expires in 5 minutes. Never share it.`,
        type: 'plain',
        channel: 'dnd',
      }),
    });
    if (!response.ok) throw new Error(`Termii send failed with status ${String(response.status)}`);
  }
}

/** Redis key holding the latest dev OTP for a phone. */
export const devOtpKey = (phone: string): string => `dev:otp:${phone}`;

/**
 * Development/test adapter: sends nothing and logs nothing; stores the latest code in Redis
 * for 5 minutes so local tooling and integration tests can read it. Refused in production by env validation.
 */
export class DevSmsSender implements SmsSender {
  /** @param redis shared redis */
  constructor(private readonly redis: Redis) {}

  /** @inheritdoc */
  async sendOtp(phone: string, code: string): Promise<void> {
    await this.redis.set(devOtpKey(phone), code, 'EX', 300);
  }
}
