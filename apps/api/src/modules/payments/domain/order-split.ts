import { Money } from '@delyva/utils';
import {
  accounts,
  buildJournal,
  credit,
  debit,
  type Journal,
  type JournalLine,
  PLATFORM_REVENUE,
  PROMO_EXPENSE,
  TAX_PAYABLE,
} from './ledger.js';
import { PaymentsError } from './payments-errors.js';

/**
 * Server-computed money breakdown of one order, all in the same currency.
 * Invariant: customerPaid + promo = vendor + rider + platformFee + tax.
 */
export interface OrderBreakdown {
  readonly customerUserId: string;
  readonly vendorId: string;
  readonly riderId: string | null;
  /** What the customer pays (held on their wallet). */
  readonly customerPaid: Money;
  /** Owed to the vendor (item subtotal net of commission). */
  readonly vendor: Money;
  /** Owed to the rider (delivery earnings). */
  readonly rider: Money;
  /** Platform revenue (commission + service fee). */
  readonly platformFee: Money;
  /** Tax collected. */
  readonly tax: Money;
  /** Platform-funded discount. */
  readonly promo: Money;
}

function assertBreakdown(b: OrderBreakdown): void {
  const parts = [b.customerPaid, b.vendor, b.rider, b.platformFee, b.tax, b.promo];
  for (const p of parts) {
    if (p.isNegative()) throw new PaymentsError('validation_failed', 'Split amounts must be >= 0');
  }
  const funded = b.customerPaid.add(b.promo);
  const owed = b.vendor.add(b.rider).add(b.platformFee).add(b.tax);
  if (!funded.equals(owed)) {
    throw new PaymentsError('validation_failed', 'Order split does not balance');
  }
  if (b.customerPaid.minor === 0) {
    throw new PaymentsError('validation_failed', 'Customer amount must be positive');
  }
  if (b.rider.minor > 0 && b.riderId === null) {
    throw new PaymentsError('validation_failed', 'Rider amount requires a rider');
  }
}

/** The credit (payee) legs of a split, skipping zero amounts. */
export function payeeLegs(b: OrderBreakdown): { account: string; amount: Money }[] {
  const legs = [
    { account: accounts.vendorPayable(b.vendorId), amount: b.vendor },
    { account: accounts.riderPayable(b.riderId ?? 'none'), amount: b.rider },
    { account: PLATFORM_REVENUE, amount: b.platformFee },
    { account: TAX_PAYABLE, amount: b.tax },
  ];
  return legs.filter((l) => l.amount.minor > 0);
}

/** Builds the capture journal: customer wallet (+ promo) funds vendor, rider, platform and tax. */
export function buildCaptureJournal(orderId: string, b: OrderBreakdown): Journal {
  assertBreakdown(b);
  const lines: JournalLine[] = [debit(accounts.customerWallet(b.customerUserId), b.customerPaid)];
  if (b.promo.minor > 0) lines.push(debit(PROMO_EXPENSE, b.promo));
  for (const leg of payeeLegs(b)) lines.push(credit(leg.account, leg.amount));
  return buildJournal({
    kind: 'order_capture',
    idempotencyKey: `order:${orderId}:capture`,
    reference: orderId,
    lines,
  });
}

/**
 * Refund journal: debits the payee legs pro rata (largest-remainder allocation, no lost kobo)
 * and credits the customer wallet. A full refund also reverses the promo funding exactly.
 */
export function buildRefundJournal(input: {
  readonly orderId: string;
  readonly refundId: string;
  readonly customerUserId: string;
  readonly amount: Money;
  /** Payee legs of the capture, as positive amounts. */
  readonly legs: readonly { account: string; amount: Money }[];
  /** Customer-paid amount still refundable before this refund. */
  readonly refundable: Money;
  /** Promo debit of the capture (only reversed on a full refund). */
  readonly promo: Money;
}): Journal {
  const { amount, refundable } = input;
  if (amount.minor <= 0) throw new PaymentsError('validation_failed', 'Refund must be positive');
  if (amount.compare(refundable) > 0) {
    throw new PaymentsError('conflict', 'Refund exceeds the refundable amount');
  }
  const isFull = amount.equals(refundable);
  const promoBack = isFull ? input.promo : Money.zero(amount.currency);
  const fromPayees = amount.add(promoBack);
  const shares = fromPayees.allocate(input.legs.map((l) => l.amount.minor));
  const lines: JournalLine[] = [];
  input.legs.forEach((leg, i) => {
    const share = shares[i];
    if (share && share.minor > 0) lines.push(debit(leg.account, share));
  });
  lines.push(credit(accounts.customerWallet(input.customerUserId), amount));
  if (promoBack.minor > 0) lines.push(credit(PROMO_EXPENSE, promoBack));
  return buildJournal({
    kind: 'order_refund',
    idempotencyKey: `refund:${input.refundId}`,
    reference: input.orderId,
    lines,
  });
}
