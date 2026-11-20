import { PAYMENTS_EVENTS, type PaymentIntent, type PaymentMethod } from '@delyva/contracts';
import { Money } from '@delyva/utils';
import type { PaymentIntentState } from '../domain/payment-intent.js';
import { PaymentsError } from '../domain/payments-errors.js';
import { assertCanHold, HOLD_TTL_SECONDS } from '../domain/wallet.js';
import { toIntentDto } from './dto.js';
import type { Clock, PaymentProvider, PaymentsStore, ProviderChannel } from './ports.js';
import { settleIntent } from './settle-intent.js';

/** Dependencies shared by the intent use cases. */
export interface IntentDeps {
  readonly store: PaymentsStore;
  readonly provider: PaymentProvider;
  readonly clock: Clock;
  /** Builds the provider-required customer email from a user id (no PII). */
  readonly customerEmail: (userId: string) => string;
}

const CHANNELS: Record<'card' | 'transfer', ProviderChannel[]> = {
  card: ['card'],
  transfer: ['bank_transfer'],
};

/** Our provider reference: unique, alphanumeric + `-` only. */
const referenceFor = (intentId: string): string => `dlv-${intentId}`;

/** Starts a provider checkout and stores the intent as `requires_action`. */
async function startProviderIntent(
  deps: IntentDeps,
  input: {
    userId: string;
    amount: Money;
    method: 'card' | 'transfer';
    purpose: PaymentIntentState['purpose'];
    orderId: string | null;
  },
): Promise<PaymentIntentState> {
  const id = deps.clock.uuid();
  const reference = referenceFor(id);
  const checkout = await deps.provider.initialize({
    reference,
    amount: input.amount,
    email: deps.customerEmail(input.userId),
    channels: CHANNELS[input.method],
    metadata: { intentId: id, purpose: input.purpose },
  });
  const intent: PaymentIntentState = {
    id,
    userId: input.userId,
    purpose: input.purpose,
    orderId: input.orderId,
    amount: input.amount,
    method: input.method,
    status: 'requires_action',
    provider: deps.provider.name,
    reference,
    authorizationUrl: checkout.authorizationUrl,
    failureReason: null,
    createdAt: deps.clock.now(),
  };
  await deps.store.transaction((tx) => tx.insertIntent(intent));
  return intent;
}

/** Command: start a wallet top-up through the provider. */
export class CreateTopUp {
  /** @param deps ports */
  constructor(private readonly deps: IntentDeps) {}

  /** Executes the command. */
  async execute(input: {
    userId: string;
    amountMinor: number;
    method: 'card' | 'transfer';
  }): Promise<PaymentIntent> {
    const intent = await startProviderIntent(this.deps, {
      userId: input.userId,
      amount: Money.ofMinor(input.amountMinor, 'NGN'),
      method: input.method,
      purpose: 'wallet_top_up',
      orderId: null,
    });
    return toIntentDto(intent);
  }
}

/**
 * Command used by ordering: create (or return the existing) payment intent for an order.
 * Wallet payments reserve funds immediately with a hold; card/transfer payments start a
 * provider checkout and reserve once the charge is verified.
 */
export class CreateIntentForOrder {
  /** @param deps ports */
  constructor(private readonly deps: IntentDeps) {}

  /** Executes the command. @throws PaymentsError conflict on insufficient wallet funds */
  async execute(input: {
    orderId: string;
    userId: string;
    amount: Money;
    method: PaymentMethod;
  }): Promise<PaymentIntent> {
    if (input.amount.minor <= 0) {
      throw new PaymentsError('validation_failed', 'Amount must be positive');
    }
    const existing = await this.deps.store.transaction((tx) => tx.findOrderIntent(input.orderId));
    if (existing) {
      if (existing.userId !== input.userId) throw new PaymentsError('conflict', 'Order mismatch');
      return toIntentDto(existing);
    }
    if (input.method === 'wallet') return toIntentDto(await this.payFromWallet(input));
    const intent = await startProviderIntent(this.deps, {
      userId: input.userId,
      amount: input.amount,
      method: input.method,
      purpose: 'order',
      orderId: input.orderId,
    });
    return toIntentDto(intent);
  }

  private payFromWallet(input: {
    orderId: string;
    userId: string;
    amount: Money;
  }): Promise<PaymentIntentState> {
    const { clock } = this.deps;
    return this.deps.store.transaction(async (tx) => {
      await tx.lockWallet(input.userId);
      const view = await tx.walletView(input.userId, input.amount.currency, clock.now());
      assertCanHold(view, input.amount);
      await tx.insertHold({
        id: clock.uuid(),
        userId: input.userId,
        reference: input.orderId,
        amount: input.amount,
        status: 'active',
        expiresAt: new Date(clock.now().getTime() + HOLD_TTL_SECONDS * 1000),
      });
      const id = clock.uuid();
      const intent: PaymentIntentState = {
        id,
        userId: input.userId,
        purpose: 'order',
        orderId: input.orderId,
        amount: input.amount,
        method: 'wallet',
        status: 'succeeded',
        provider: 'wallet',
        reference: referenceFor(id),
        authorizationUrl: null,
        failureReason: null,
        createdAt: clock.now(),
      };
      await tx.insertIntent(intent);
      await tx.appendEvent({
        type: PAYMENTS_EVENTS.intentSucceeded,
        aggregateType: 'payment_intent',
        aggregateId: id,
        payload: {
          intentId: id,
          userId: input.userId,
          orderId: input.orderId,
          amount: input.amount.toJSON(),
        },
      });
      return intent;
    });
  }
}

/** Query: one of the caller's intents. Other users' intents are reported as not found (IDOR). */
export class GetIntent {
  /** @param store payments store */
  constructor(private readonly store: PaymentsStore) {}

  /** Executes the query. @throws PaymentsError not_found */
  async execute(input: { userId: string; intentId: string }): Promise<PaymentIntent> {
    const intent = await this.store.findIntent(input.intentId);
    if (intent?.userId !== input.userId) {
      throw new PaymentsError('not_found', 'Payment not found.');
    }
    return toIntentDto(intent);
  }
}

/** Command: server-side verify with the provider, then settle. Never trusts the client redirect. */
export class VerifyIntent {
  /** @param deps ports */
  constructor(private readonly deps: IntentDeps) {}

  /** Executes the command. @throws PaymentsError not_found */
  async execute(input: { userId: string; intentId: string }): Promise<PaymentIntent> {
    const found = await this.deps.store.findIntent(input.intentId);
    if (found?.userId !== input.userId) {
      throw new PaymentsError('not_found', 'Payment not found.');
    }
    if (found.provider !== this.deps.provider.name) return toIntentDto(found);
    const charge = await this.deps.provider.verify(found.reference);
    const settled = await this.deps.store.transaction(async (tx) => {
      const locked = await tx.lockIntent(found.id);
      if (!locked) throw new PaymentsError('not_found', 'Payment not found.');
      return settleIntent(tx, locked, charge, this.deps.clock);
    });
    return toIntentDto(settled);
  }
}
