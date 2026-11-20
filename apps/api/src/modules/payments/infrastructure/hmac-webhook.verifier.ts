import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { ProviderWebhookEvent, WebhookVerifier } from '../application/ports.js';

/** Computes the Paystack-style signature: hex HMAC-SHA512 of the raw body keyed by the secret. */
export function signWebhook(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}

const EventSchema = z.object({
  event: z.string().min(1).max(100),
  data: z.object({
    id: z.union([z.number().int(), z.string().min(1)]).optional(),
    reference: z.string().min(1).max(200).optional(),
  }),
});

/**
 * Verifies `x-paystack-signature` (HMAC-SHA512 hex over the raw body with the secret key) in
 * constant time and parses the `{ event, data }` body. Paystack bodies carry no top-level event
 * id, so the dedupe key is derived as `<event>:<data.id|data.reference>`.
 */
export class HmacSha512WebhookVerifier implements WebhookVerifier {
  /** @param secret provider secret key (from env) */
  constructor(private readonly secret: string) {}

  /** @inheritdoc */
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !/^[0-9a-f]{128}$/i.test(signature) || this.secret === '') return false;
    const expected = Buffer.from(signWebhook(rawBody, this.secret), 'hex');
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  }

  /** @inheritdoc */
  parse(rawBody: Buffer): ProviderWebhookEvent | null {
    let json: unknown;
    try {
      json = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return null;
    }
    const parsed = EventSchema.safeParse(json);
    if (!parsed.success) return null;
    const { event, data } = parsed.data;
    const key = data.id ?? data.reference;
    if (key === undefined) return null;
    return { eventId: `${event}:${String(key)}`, type: event, reference: data.reference ?? null };
  }
}
