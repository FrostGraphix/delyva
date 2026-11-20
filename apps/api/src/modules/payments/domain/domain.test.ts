import { Money } from '@delyva/utils';
import { describe, expect, it } from 'vitest';
import {
  accounts,
  buildJournal,
  credit,
  creditBalance,
  debit,
  parseAccountCode,
  PLATFORM_REVENUE,
  PROMO_EXPENSE,
  reverseJournal,
  TAX_PAYABLE,
} from './ledger.js';
import {
  buildCaptureJournal,
  buildRefundJournal,
  type OrderBreakdown,
  payeeLegs,
} from './order-split.js';
import {
  decideSettlement,
  isSettled,
  type PaymentIntentState,
  transition,
} from './payment-intent.js';
import { LedgerInvariantError, PaymentsError } from './payments-errors.js';
import { buildPayoutJournal, payoutReference, planPayouts } from './payout.js';
import { reconcile } from './reconciliation.js';
import { assertCanHold, walletView } from './wallet.js';

const ngn = (minor: number): Money => Money.ofMinor(minor, 'NGN');
const sum = (lines: readonly { amount: Money }[]): number =>
  lines.reduce((s, l) => s + l.amount.minor, 0);

describe('ledger journal', () => {
  it('accepts a balanced journal and freezes it', () => {
    const j = buildJournal({
      kind: 'wallet_top_up',
      idempotencyKey: 'k1',
      reference: 'r',
      lines: [
        debit(accounts.providerClearing('fake'), ngn(500)),
        credit(accounts.customerWallet('u'), ngn(500)),
      ],
    });
    expect(sum(j.lines)).toBe(0);
    expect(Object.isFrozen(j)).toBe(true);
  });

  it('rejects unbalanced, single-line, zero and unknown-account journals', () => {
    const base = { kind: 'wallet_top_up' as const, idempotencyKey: 'k', reference: 'r' };
    expect(() =>
      buildJournal({
        ...base,
        lines: [debit(PLATFORM_REVENUE, ngn(1)), credit(TAX_PAYABLE, ngn(2))],
      }),
    ).toThrow(/unbalanced/);
    expect(() => buildJournal({ ...base, lines: [debit(PLATFORM_REVENUE, ngn(1))] })).toThrow(
      /at least 2/,
    );
    expect(() =>
      buildJournal({
        ...base,
        lines: [
          { account: TAX_PAYABLE, amount: ngn(0) },
          { account: PLATFORM_REVENUE, amount: ngn(0) },
        ],
      }),
    ).toThrow(/Zero/);
    expect(() =>
      buildJournal({ ...base, lines: [debit('bogus', ngn(1)), credit(TAX_PAYABLE, ngn(1))] }),
    ).toThrow(LedgerInvariantError);
    expect(() =>
      buildJournal({
        ...base,
        idempotencyKey: '',
        lines: [debit(TAX_PAYABLE, ngn(1)), credit(PLATFORM_REVENUE, ngn(1))],
      }),
    ).toThrow(/idempotency/);
    expect(() => debit(TAX_PAYABLE, ngn(-1))).toThrow(/positive/);
    expect(() => parseAccountCode('customer_wallet:a:b')).toThrow();
  });

  it('balances per currency independently', () => {
    const usd = Money.ofMinor(5, 'USD');
    expect(() =>
      buildJournal({
        kind: 'reversal',
        idempotencyKey: 'k',
        reference: 'r',
        lines: [debit(TAX_PAYABLE, ngn(5)), credit(PLATFORM_REVENUE, usd)],
      }),
    ).toThrow(/unbalanced in NGN/);
  });

  it('reverses by negating every line', () => {
    const lines = [debit(PLATFORM_REVENUE, ngn(7)), credit(TAX_PAYABLE, ngn(7))];
    const r = reverseJournal({ id: 't1', lines }, 't1:rev');
    expect(r.reversesId).toBe('t1');
    expect(r.lines.map((l) => l.amount.minor)).toEqual([-7, 7]);
  });

  it('reads credit-normal balances and parses account codes', () => {
    expect(creditBalance(-250, 'NGN').minor).toBe(250);
    expect(parseAccountCode('vendor_payable:v1')).toEqual({
      type: 'vendor_payable',
      ownerId: 'v1',
    });
    expect(parseAccountCode(PROMO_EXPENSE)).toEqual({ type: 'promo_expense', ownerId: null });
  });
});

const breakdown = (over: Partial<OrderBreakdown> = {}): OrderBreakdown => ({
  customerUserId: 'cust',
  vendorId: 'ven',
  riderId: 'rid',
  customerPaid: ngn(10_000),
  vendor: ngn(7_001),
  rider: ngn(1_500),
  platformFee: ngn(1_000),
  tax: ngn(999),
  promo: ngn(500),
  ...over,
});

describe('order split', () => {
  it('posts customer + promo against vendor, rider, platform and tax', () => {
    const j = buildCaptureJournal('o1', breakdown());
    expect(sum(j.lines)).toBe(0);
    expect(j.lines).toHaveLength(6);
    expect(j.idempotencyKey).toBe('order:o1:capture');
  });

  it('rejects splits that do not balance, are negative, or pay a missing rider', () => {
    expect(() => buildCaptureJournal('o', breakdown({ tax: ngn(1) }))).toThrow(/balance/);
    expect(() => buildCaptureJournal('o', breakdown({ promo: ngn(-1) }))).toThrow(/>= 0/);
    expect(() => buildCaptureJournal('o', breakdown({ riderId: null }))).toThrow(/rider/);
    expect(() =>
      buildCaptureJournal('o', breakdown({ customerPaid: ngn(0), promo: ngn(10_500) })),
    ).toThrow(/positive/);
  });

  it('skips zero legs', () => {
    expect(payeeLegs(breakdown({ rider: ngn(0), riderId: null, vendor: ngn(8_501) }))).toHaveLength(
      3,
    );
  });

  it('allocates a partial refund pro rata without losing a kobo', () => {
    const legs = payeeLegs(breakdown());
    const j = buildRefundJournal({
      orderId: 'o',
      refundId: 'f',
      customerUserId: 'cust',
      amount: ngn(3_333),
      legs,
      refundable: ngn(10_000),
      promo: ngn(500),
    });
    expect(sum(j.lines)).toBe(0);
    const debits = j.lines.filter((l) => l.amount.minor > 0);
    expect(debits.reduce((s, l) => s + l.amount.minor, 0)).toBe(3_333);
  });

  it('reverses the promo exactly on a full refund', () => {
    const legs = payeeLegs(breakdown());
    const j = buildRefundJournal({
      orderId: 'o',
      refundId: 'f',
      customerUserId: 'cust',
      amount: ngn(10_000),
      legs,
      refundable: ngn(10_000),
      promo: ngn(500),
    });
    const promo = j.lines.find((l) => l.account === PROMO_EXPENSE);
    expect(promo?.amount.minor).toBe(-500);
    expect(sum(j.lines)).toBe(0);
  });

  it('rejects refunds above the refundable amount or non-positive', () => {
    const legs = payeeLegs(breakdown());
    const args = {
      orderId: 'o',
      refundId: 'f',
      customerUserId: 'c',
      legs,
      refundable: ngn(100),
      promo: ngn(0),
    };
    expect(() => buildRefundJournal({ ...args, amount: ngn(101) })).toThrow(PaymentsError);
    expect(() => buildRefundJournal({ ...args, amount: ngn(0) })).toThrow(/positive/);
  });
});

const intent = (over: Partial<PaymentIntentState> = {}): PaymentIntentState => ({
  id: 'i',
  userId: 'u',
  purpose: 'wallet_top_up',
  orderId: null,
  amount: ngn(10_000),
  method: 'card',
  status: 'requires_action',
  provider: 'fake',
  reference: 'ref',
  authorizationUrl: null,
  failureReason: null,
  createdAt: new Date(0),
  ...over,
});
const charge = (
  outcome: 'success' | 'failed' | 'pending',
  amount = ngn(10_000),
  reference = 'ref',
) => ({
  reference,
  outcome,
  amount,
  providerTransactionId: '1',
});

describe('payment intent state machine', () => {
  it('follows requires_action → processing → succeeded → refunded', () => {
    const p = transition(intent(), 'processing');
    const s = transition(p, 'succeeded');
    expect(transition(s, 'refunded').status).toBe('refunded');
    expect(transition(intent(), 'failed', 'x').failureReason).toBe('x');
  });

  it('rejects illegal transitions', () => {
    expect(() => transition(intent({ status: 'failed' }), 'succeeded')).toThrow(/Cannot move/);
    expect(() => transition(intent({ status: 'succeeded' }), 'failed')).toThrow(PaymentsError);
    expect(isSettled('processing')).toBe(false);
  });

  it('only succeeds when provider says success with the exact amount', () => {
    expect(decideSettlement(intent(), charge('success'))).toEqual({ kind: 'succeed' });
    expect(decideSettlement(intent(), charge('success', ngn(9_999)))).toEqual({
      kind: 'fail',
      reason: 'amount_mismatch',
    });
    expect(decideSettlement(intent(), charge('failed'))).toEqual({
      kind: 'fail',
      reason: 'provider_declined',
    });
    expect(decideSettlement(intent(), charge('success', ngn(1), 'other'))).toEqual({
      kind: 'fail',
      reason: 'reference_mismatch',
    });
    expect(decideSettlement(intent(), charge('pending'))).toEqual({ kind: 'processing' });
    expect(decideSettlement(intent({ status: 'processing' }), charge('pending'))).toEqual({
      kind: 'noop',
    });
    expect(decideSettlement(intent({ status: 'succeeded' }), charge('success'))).toEqual({
      kind: 'noop',
    });
  });
});

describe('wallet holds', () => {
  it('computes available and guards overspend', () => {
    const v = walletView(ngn(1_000), ngn(400));
    expect(v.available.minor).toBe(600);
    expect(() => {
      assertCanHold(v, ngn(600));
    }).not.toThrow();
    expect(() => {
      assertCanHold(v, ngn(601));
    }).toThrow(/Insufficient/);
    expect(() => {
      assertCanHold(v, ngn(0));
    }).toThrow(/positive/);
  });
});

describe('payouts and reconciliation', () => {
  it('plans payouts above the minimum with provider-safe references', () => {
    const plan = planPayouts(
      '2026-w47',
      [
        { account: 'vendor_payable:A', payeeId: 'A', balance: ngn(200_000) },
        { account: 'vendor_payable:b', payeeId: 'b', balance: ngn(50) },
      ],
      ngn(100_000),
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]?.reference).toBe('payout_2026-w47_a');
    expect(payoutReference('B 1', 'x.y')).toBe('payout_b-1_x-y');
    const first = plan[0];
    if (!first) throw new Error('expected a planned payout');
    expect(sum(buildPayoutJournal('p1', first, 'fake').lines)).toBe(0);
  });

  it('reports missing and mismatched charges', () => {
    const out = reconcile(
      [
        { reference: 'a', amount: ngn(1) },
        { reference: 'b', amount: ngn(2) },
      ],
      [
        { reference: 'b', amount: ngn(3) },
        { reference: 'c', amount: ngn(4) },
      ],
    );
    expect(out).toEqual([
      { reference: 'a', kind: 'missing_in_ledger' },
      { reference: 'b', kind: 'amount_mismatch' },
      { reference: 'c', kind: 'missing_at_provider' },
    ]);
  });
});
