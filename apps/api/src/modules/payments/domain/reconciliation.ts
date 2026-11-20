import type { Money } from '@delyva/utils';

/** A successful charge as recorded on one side. */
export interface SettledCharge {
  readonly reference: string;
  readonly amount: Money;
}

/** One reconciliation discrepancy. */
export interface Mismatch {
  readonly reference: string;
  readonly kind: 'missing_in_ledger' | 'missing_at_provider' | 'amount_mismatch';
}

/** Compares provider-reported successful charges with intents settled in our ledger. */
export function reconcile(
  provider: readonly SettledCharge[],
  ledger: readonly SettledCharge[],
): Mismatch[] {
  const ours = new Map(ledger.map((c) => [c.reference, c]));
  const theirs = new Map(provider.map((c) => [c.reference, c]));
  const out: Mismatch[] = [];
  for (const [ref, charge] of theirs) {
    const mine = ours.get(ref);
    if (!mine) out.push({ reference: ref, kind: 'missing_in_ledger' });
    else if (!mine.amount.equals(charge.amount)) {
      out.push({ reference: ref, kind: 'amount_mismatch' });
    }
  }
  for (const ref of ours.keys()) {
    if (!theirs.has(ref)) out.push({ reference: ref, kind: 'missing_at_provider' });
  }
  return out.sort((a, b) => a.reference.localeCompare(b.reference));
}
