import type { Money } from '@delyva/utils';
import { PaymentsError } from './payments-errors.js';

/** Default lifetime of a checkout hold before it lapses (15 minutes). */
export const HOLD_TTL_SECONDS = 900;

/** Wallet figures derived from the ledger and active holds. */
export interface WalletView {
  readonly balance: Money;
  readonly held: Money;
  readonly available: Money;
}

/** Computes the wallet view; available = balance − active holds. */
export function walletView(balance: Money, held: Money): WalletView {
  return { balance, held, available: balance.subtract(held) };
}

/**
 * Guards a new hold: amount must be positive and fit in the available balance.
 * Callers MUST hold the per-wallet lock while computing `view` and inserting the hold.
 * @throws PaymentsError
 */
export function assertCanHold(view: WalletView, amount: Money): void {
  if (amount.minor <= 0) throw new PaymentsError('validation_failed', 'Hold must be positive');
  if (amount.compare(view.available) > 0) {
    throw new PaymentsError('conflict', 'Insufficient wallet balance');
  }
}
