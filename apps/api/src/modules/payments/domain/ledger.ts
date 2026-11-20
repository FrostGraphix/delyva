import { type CurrencyCode, Money } from '@delyva/utils';
import { LedgerInvariantError } from './payments-errors.js';

/** Fixed (singleton) ledger accounts. */
export const PLATFORM_REVENUE = 'platform_revenue';
/** Tax collected and owed to the tax authority. */
export const TAX_PAYABLE = 'tax_payable';
/** Promotions funded by the platform. */
export const PROMO_EXPENSE = 'promo_expense';

/** Ledger account code builders. Codes are `<type>[:<ownerId>]`. */
export const accounts = {
  customerWallet: (userId: string): string => `customer_wallet:${userId}`,
  vendorPayable: (vendorId: string): string => `vendor_payable:${vendorId}`,
  riderPayable: (riderId: string): string => `rider_payable:${riderId}`,
  providerClearing: (provider: string): string => `provider_clearing:${provider}`,
} as const;

/** Account types allowed in the ledger. */
export const ACCOUNT_TYPES = [
  'customer_wallet',
  'platform_revenue',
  'vendor_payable',
  'rider_payable',
  'provider_clearing',
  'tax_payable',
  'promo_expense',
] as const;
/** Account type. */
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Splits an account code into its type and optional owner. @throws LedgerInvariantError */
export function parseAccountCode(code: string): { type: AccountType; ownerId: string | null } {
  const [type, ownerId, extra] = code.split(':');
  if (extra !== undefined || !(ACCOUNT_TYPES as readonly string[]).includes(type ?? '')) {
    throw new LedgerInvariantError(`Unknown account code ${code}`);
  }
  return { type: type as AccountType, ownerId: ownerId ?? null };
}

/**
 * One journal line. Sign convention: positive = debit, negative = credit.
 * Liability accounts (wallets, payables) therefore carry negative balances when money is owed.
 */
export interface JournalLine {
  readonly account: string;
  readonly amount: Money;
}

/** Kinds of journal transactions. */
export type JournalKind =
  'wallet_top_up' | 'order_capture' | 'order_refund' | 'refund_to_source' | 'payout' | 'reversal';

/** A balanced, validated journal transaction ready to post. */
export interface Journal {
  readonly kind: JournalKind;
  /** Unique key: posting the same key twice is a no-op. */
  readonly idempotencyKey: string;
  /** Business reference (intent id, order id, payout id). */
  readonly reference: string;
  readonly lines: readonly JournalLine[];
  /** Transaction id this journal compensates, if any. */
  readonly reversesId?: string;
}

/**
 * Validates and freezes a journal: at least two lines, no zero lines, every account code known,
 * and lines sum to zero per currency. The DB enforces the same rules again (deferred trigger).
 * @throws LedgerInvariantError
 */
export function buildJournal(input: Journal): Journal {
  if (input.lines.length < 2) throw new LedgerInvariantError('A journal needs at least 2 lines');
  if (input.idempotencyKey.length === 0) throw new LedgerInvariantError('Missing idempotency key');
  const sums = new Map<CurrencyCode, number>();
  for (const line of input.lines) {
    parseAccountCode(line.account);
    if (line.amount.minor === 0) throw new LedgerInvariantError('Zero-amount line');
    const c = line.amount.currency;
    sums.set(c, (sums.get(c) ?? 0) + line.amount.minor);
  }
  for (const [currency, sum] of sums) {
    if (sum !== 0) {
      throw new LedgerInvariantError(`Journal unbalanced in ${currency} by ${String(sum)}`);
    }
  }
  return Object.freeze({ ...input, lines: Object.freeze([...input.lines]) });
}

/** Builds the compensating journal for an already-posted one (every line negated). */
export function reverseJournal(
  original: { readonly id: string; readonly lines: readonly JournalLine[] },
  idempotencyKey: string,
): Journal {
  return buildJournal({
    kind: 'reversal',
    idempotencyKey,
    reference: original.id,
    reversesId: original.id,
    lines: original.lines.map((l) => ({ account: l.account, amount: l.amount.multiply(-1) })),
  });
}

/** Debit helper (positive line). @throws on non-positive amount */
export function debit(account: string, amount: Money): JournalLine {
  assertPositive(amount);
  return { account, amount };
}

/** Credit helper (negative line). @throws on non-positive amount */
export function credit(account: string, amount: Money): JournalLine {
  assertPositive(amount);
  return { account, amount: amount.multiply(-1) };
}

function assertPositive(amount: Money): void {
  if (amount.minor <= 0) throw new LedgerInvariantError('Line amounts must be positive');
}

/** Balance of a credit-normal account (wallet, payable) from the raw signed entry sum. */
export function creditBalance(rawSumMinor: number, currency: CurrencyCode): Money {
  return Money.ofMinor(-rawSumMinor, currency);
}
