import type { PaymentIntentStatus, PaymentMethod } from '@delyva/contracts';
import type { Money } from '@delyva/utils';
import { PaymentsError } from './payments-errors.js';

/** Persistent state of a payment intent. */
export interface PaymentIntentState {
  readonly id: string;
  readonly userId: string;
  readonly purpose: 'wallet_top_up' | 'order';
  readonly orderId: string | null;
  readonly amount: Money;
  readonly method: PaymentMethod;
  readonly status: PaymentIntentStatus;
  readonly provider: string;
  /** Our reference sent to the provider (unique). */
  readonly reference: string;
  readonly authorizationUrl: string | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
}

const ALLOWED: Record<PaymentIntentStatus, readonly PaymentIntentStatus[]> = {
  requires_action: ['processing', 'succeeded', 'failed'],
  processing: ['succeeded', 'failed'],
  succeeded: ['refunded'],
  failed: [],
  refunded: [],
};

/** True when no further transitions are possible except refund. */
export function isSettled(status: PaymentIntentStatus): boolean {
  return status !== 'requires_action' && status !== 'processing';
}

/**
 * Moves an intent to a new status following the state machine
 * requires_action → processing → succeeded | failed; succeeded → refunded.
 * @throws PaymentsError conflict on an illegal transition
 */
export function transition(
  intent: PaymentIntentState,
  to: PaymentIntentStatus,
  failureReason: string | null = null,
): PaymentIntentState {
  if (!ALLOWED[intent.status].includes(to)) {
    throw new PaymentsError('conflict', `Cannot move payment from ${intent.status} to ${to}`);
  }
  return { ...intent, status: to, failureReason: to === 'failed' ? failureReason : null };
}

/** Outcome reported by a provider verify call, normalised. */
export interface VerifiedCharge {
  readonly reference: string;
  readonly outcome: 'success' | 'failed' | 'pending';
  readonly amount: Money;
  readonly providerTransactionId: string;
}

/** Decision on how to settle an intent given a verified provider charge. */
export type SettlementDecision =
  | { readonly kind: 'noop' }
  | { readonly kind: 'processing' }
  | { readonly kind: 'succeed' }
  | { readonly kind: 'fail'; readonly reason: string };

/**
 * Pure settlement policy: a charge only succeeds when the provider says success AND the exact
 * amount and currency match what we asked for. Already-settled intents are left alone.
 */
export function decideSettlement(
  intent: PaymentIntentState,
  charge: VerifiedCharge,
): SettlementDecision {
  if (isSettled(intent.status)) return { kind: 'noop' };
  if (charge.reference !== intent.reference) return { kind: 'fail', reason: 'reference_mismatch' };
  if (charge.outcome === 'pending') {
    return intent.status === 'processing' ? { kind: 'noop' } : { kind: 'processing' };
  }
  if (charge.outcome === 'failed') return { kind: 'fail', reason: 'provider_declined' };
  if (!charge.amount.equals(intent.amount)) return { kind: 'fail', reason: 'amount_mismatch' };
  return { kind: 'succeed' };
}
