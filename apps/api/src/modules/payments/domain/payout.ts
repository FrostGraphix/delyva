import type { Money } from '@delyva/utils';
import { accounts, buildJournal, credit, debit, type Journal } from './ledger.js';

/** A payee balance read from the ledger (positive = we owe them). */
export interface PayableBalance {
  readonly account: string;
  readonly payeeId: string;
  readonly balance: Money;
}

/** One planned transfer. */
export interface PlannedPayout {
  readonly account: string;
  readonly payeeId: string;
  readonly amount: Money;
  /** Provider transfer reference: lowercase alphanumeric with - and _ only (Paystack rule). */
  readonly reference: string;
}

/** Turns a batch id + payee into a provider-safe, deterministic transfer reference. */
export function payoutReference(batchId: string, payeeId: string): string {
  const safe = `payout_${batchId}_${payeeId}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return safe.slice(0, 100);
}

/** Plans payouts for every payee owed at least `minimum`. Deterministic for a given batch. */
export function planPayouts(
  batchId: string,
  balances: readonly PayableBalance[],
  minimum: Money,
): PlannedPayout[] {
  return balances
    .filter((b) => b.balance.compare(minimum) >= 0 && b.balance.minor > 0)
    .map((b) => ({
      account: b.account,
      payeeId: b.payeeId,
      amount: b.balance,
      reference: payoutReference(batchId, b.payeeId),
    }));
}

/** Ledger entry for a sent payout: the payable is settled out of provider clearing. */
export function buildPayoutJournal(payoutId: string, p: PlannedPayout, provider: string): Journal {
  return buildJournal({
    kind: 'payout',
    idempotencyKey: `payout:${payoutId}`,
    reference: payoutId,
    lines: [debit(p.account, p.amount), credit(accounts.providerClearing(provider), p.amount)],
  });
}
