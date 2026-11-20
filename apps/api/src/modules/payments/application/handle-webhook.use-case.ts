import type { WebhookAck } from '@delyva/contracts';
import { PaymentsError } from '../domain/payments-errors.js';
import type { VerifiedCharge } from '../domain/payment-intent.js';
import type { PayoutTransitions } from './payouts.use-cases.js';
import type {
  Clock,
  PaymentProvider,
  PaymentsLogger,
  PaymentsStore,
  ProviderWebhookEvent,
  WebhookVerifier,
} from './ports.js';
import { settleIntent } from './settle-intent.js';

/** Dependencies of {@link HandleProviderWebhook}. */
export interface HandleWebhookDeps {
  readonly store: PaymentsStore;
  readonly provider: PaymentProvider;
  readonly verifier: WebhookVerifier;
  readonly clock: Clock;
  readonly logger: PaymentsLogger;
  readonly payouts: PayoutTransitions;
  /** Allowlisted source IPs; empty means "not enforced" (non-production only, env-validated). */
  readonly allowedIps: readonly string[];
}

/**
 * Command: handle a provider webhook. Order of checks: source IP allowlist → HMAC signature over
 * the raw body → parse → dedupe by provider event id (in the same DB transaction as the effect,
 * so a failure lets the provider retry) → effect. Charge events are re-verified server-side.
 */
export class HandleProviderWebhook {
  /** @param deps ports */
  constructor(private readonly deps: HandleWebhookDeps) {}

  /** Executes the command. @throws PaymentsError forbidden | unauthorized | validation_failed */
  async execute(input: {
    rawBody: Buffer;
    signature: string | undefined;
    ip: string;
  }): Promise<WebhookAck> {
    const { allowedIps, verifier } = this.deps;
    if (allowedIps.length > 0 && !allowedIps.includes(input.ip)) {
      this.deps.logger.warn({ ip: input.ip }, 'webhook from non-allowlisted ip');
      throw new PaymentsError('forbidden', 'Source not allowed.');
    }
    if (!verifier.verifySignature(input.rawBody, input.signature)) {
      throw new PaymentsError('unauthorized', 'Invalid signature.');
    }
    const event = verifier.parse(input.rawBody);
    if (!event) throw new PaymentsError('validation_failed', 'Malformed webhook.');
    const charge = await this.verifiedChargeFor(event);
    const fresh = await this.deps.store.transaction(async (tx) => {
      const isNew = await tx.recordWebhookEvent(this.deps.provider.name, event.eventId, event.type);
      if (!isNew) return false;
      if (charge) {
        const intent = await tx.lockIntentByReference(charge.reference);
        if (intent) await settleIntent(tx, intent, charge, this.deps.clock);
        else this.deps.logger.warn({ eventType: event.type }, 'webhook for unknown reference');
      }
      if (event.reference && event.type.startsWith('transfer.')) {
        await this.deps.payouts.onTransferEvent(tx, event.reference, event.type);
      }
      return true;
    });
    this.deps.logger.info({ eventType: event.type, duplicate: !fresh }, 'webhook handled');
    return { received: true, duplicate: !fresh };
  }

  /** Charge events are never trusted as-is: we call the provider's verify endpoint. */
  private async verifiedChargeFor(event: ProviderWebhookEvent): Promise<VerifiedCharge | null> {
    if (event.type !== 'charge.success' || !event.reference) return null;
    return this.deps.provider.verify(event.reference);
  }
}
