import { PAYMENTS_EVENTS } from '@delyva/contracts';
import { accounts, buildJournal, credit, debit } from '../domain/ledger.js';
import {
  decideSettlement,
  type PaymentIntentState,
  transition,
  type VerifiedCharge,
} from '../domain/payment-intent.js';
import { HOLD_TTL_SECONDS } from '../domain/wallet.js';
import type { Clock, PaymentsTx } from './ports.js';

/**
 * Applies a provider-verified charge to a LOCKED intent inside the caller's transaction.
 * Success credits the customer wallet from provider clearing; an order intent additionally
 * reserves the funds with a hold for that order. Idempotent: settled intents are untouched.
 */
export async function settleIntent(
  tx: PaymentsTx,
  intent: PaymentIntentState,
  charge: VerifiedCharge,
  clock: Clock,
): Promise<PaymentIntentState> {
  const decision = decideSettlement(intent, charge);
  if (decision.kind === 'noop') return intent;
  if (decision.kind === 'processing') {
    const next = transition(intent, 'processing');
    await tx.updateIntent(next);
    return next;
  }
  if (decision.kind === 'fail') {
    const next = transition(intent, 'failed', decision.reason);
    await tx.updateIntent(next, charge.providerTransactionId);
    await tx.appendEvent({
      type: PAYMENTS_EVENTS.intentFailed,
      aggregateType: 'payment_intent',
      aggregateId: intent.id,
      payload: {
        intentId: intent.id,
        userId: intent.userId,
        orderId: intent.orderId,
        reason: decision.reason,
      },
    });
    return next;
  }
  return succeed(tx, intent, charge, clock);
}

async function succeed(
  tx: PaymentsTx,
  intent: PaymentIntentState,
  charge: VerifiedCharge,
  clock: Clock,
): Promise<PaymentIntentState> {
  await tx.lockWallet(intent.userId);
  await tx.post(
    buildJournal({
      kind: 'wallet_top_up',
      idempotencyKey: `intent:${intent.id}:succeeded`,
      reference: intent.id,
      lines: [
        debit(accounts.providerClearing(intent.provider), intent.amount),
        credit(accounts.customerWallet(intent.userId), intent.amount),
      ],
    }),
  );
  if (intent.purpose === 'order' && intent.orderId !== null) {
    await tx.insertHold({
      id: clock.uuid(),
      userId: intent.userId,
      reference: intent.orderId,
      amount: intent.amount,
      status: 'active',
      expiresAt: new Date(clock.now().getTime() + HOLD_TTL_SECONDS * 1000),
    });
  }
  const next = transition(intent, 'succeeded');
  await tx.updateIntent(next, charge.providerTransactionId);
  await tx.appendEvent({
    type: PAYMENTS_EVENTS.intentSucceeded,
    aggregateType: 'payment_intent',
    aggregateId: intent.id,
    payload: {
      intentId: intent.id,
      userId: intent.userId,
      orderId: intent.orderId,
      amount: intent.amount.toJSON(),
    },
  });
  return next;
}
