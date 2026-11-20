import { ORDER_STATUSES, type OrderStatus } from '@delyva/contracts';
import { describe, expect, it } from 'vitest';
import { addLine, selectionKey } from './cart.js';
import {
  assertTotalsBalance,
  bpsFloor,
  orderRef,
  pricingZoneCode,
  splitOrder,
} from './order-money.js';
import {
  assertActor,
  assertTransition,
  canTransition,
  isActive,
  ORDER_TRANSITIONS,
} from './order-state-machine.js';

/** The allowed edges, written out independently of the table under test. */
const ALLOWED: [OrderStatus, OrderStatus][] = [
  ['PENDING_PAYMENT', 'PLACED'],
  ['PENDING_PAYMENT', 'PAYMENT_FAILED'],
  ['PENDING_PAYMENT', 'CANCELLED_BY_CUSTOMER'],
  ['PENDING_PAYMENT', 'CANCELLED_BY_OPS'],
  ['PLACED', 'VENDOR_ACCEPTED'],
  ['PLACED', 'VENDOR_REJECTED'],
  ['PLACED', 'CANCELLED_BY_CUSTOMER'],
  ['PLACED', 'CANCELLED_BY_OPS'],
  ['VENDOR_ACCEPTED', 'PREPARING'],
  ['VENDOR_ACCEPTED', 'CANCELLED_BY_CUSTOMER'],
  ['VENDOR_ACCEPTED', 'CANCELLED_BY_OPS'],
  ['PREPARING', 'READY_FOR_PICKUP'],
  ['PREPARING', 'CANCELLED_BY_OPS'],
  ['READY_FOR_PICKUP', 'RIDER_ASSIGNED'],
  ['READY_FOR_PICKUP', 'CANCELLED_BY_OPS'],
  ['RIDER_ASSIGNED', 'RIDER_AT_VENDOR'],
  ['RIDER_ASSIGNED', 'CANCELLED_BY_OPS'],
  ['RIDER_AT_VENDOR', 'PICKED_UP'],
  ['RIDER_AT_VENDOR', 'CANCELLED_BY_OPS'],
  ['PICKED_UP', 'RIDER_AT_CUSTOMER'],
  ['PICKED_UP', 'UNDELIVERABLE'],
  ['PICKED_UP', 'CANCELLED_BY_OPS'],
  ['RIDER_AT_CUSTOMER', 'DELIVERED'],
  ['RIDER_AT_CUSTOMER', 'UNDELIVERABLE'],
  ['RIDER_AT_CUSTOMER', 'CANCELLED_BY_OPS'],
  ['VENDOR_REJECTED', 'REFUND_PENDING'],
  ['CANCELLED_BY_CUSTOMER', 'REFUND_PENDING'],
  ['CANCELLED_BY_OPS', 'REFUND_PENDING'],
  ['UNDELIVERABLE', 'REFUND_PENDING'],
  ['REFUND_PENDING', 'REFUNDED'],
];
const allowed = new Set(ALLOWED.map(([a, b]) => `${a}>${b}`));

describe('order state machine', () => {
  it.each(ALLOWED)('allows %s → %s', (from, to) => {
    expect(assertTransition(from, to)).toBe(to);
  });

  it('rejects every pair not in the table (exhaustive 17×17)', () => {
    let rejected = 0;
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        if (allowed.has(`${from}>${to}`)) continue;
        expect(canTransition(from, to)).toBe(false);
        expect(() => assertTransition(from, to)).toThrow(/cannot move/);
        rejected++;
      }
    }
    expect(rejected).toBe(17 * 17 - ALLOWED.length);
    const tableSize = Object.values(ORDER_TRANSITIONS).reduce((n, l) => n + l.length, 0);
    expect(tableSize).toBe(ALLOWED.length);
  });

  it('rejects cancel after PREPARING', () => {
    for (const s of ['PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'DELIVERED'] as const) {
      expect(() => assertTransition(s, 'CANCELLED_BY_CUSTOMER')).toThrow();
    }
  });

  it('keeps terminal states closed and knows active ones', () => {
    for (const s of ['DELIVERED', 'PAYMENT_FAILED', 'REFUNDED'] as const) {
      expect(ORDER_TRANSITIONS[s]).toEqual([]);
      expect(isActive(s)).toBe(false);
    }
    expect(isActive('PICKED_UP')).toBe(true);
  });

  it('restricts actors per target state', () => {
    expect(() => assertActor('VENDOR_ACCEPTED', 'customer')).toThrow(/cannot move/);
    expect(() => assertActor('DELIVERED', 'vendor')).toThrow();
    expect(() => assertActor('CANCELLED_BY_OPS', 'ops')).not.toThrow();
  });
});

const totals = {
  itemsSubtotal: 500_000,
  deliveryFee: 40_000,
  surgeFee: 8_000,
  smallOrderFee: 0,
  serviceFee: 25_000,
  discount: 50_000,
  vat: 5_475,
  total: 528_475,
};

describe('order money', () => {
  it('splits so that customerPaid + promo = vendor + rider + platform + tax', () => {
    const s = splitOrder(totals, { vendorCommissionBps: 1_000, riderDeliveryShareBps: 8_000 });
    expect(s.vendor.minor).toBe(450_000);
    expect(s.rider.minor).toBe(38_400);
    expect(s.platformFee.minor).toBe(50_000 + 25_000 + 9_600);
    const funded = s.customerPaid.add(s.promo).minor;
    expect(funded).toBe(s.vendor.add(s.rider).add(s.platformFee).add(s.tax).minor);
  });

  it('rejects unbalanced totals and uses integer bps', () => {
    expect(() => assertTotalsBalance({ ...totals, total: 1 })).toThrow(/balance/);
    expect(bpsFloor(999, 3_333)).toBe(332);
  });

  it('maps a geo zone city to a pricing zone code and builds refs', () => {
    expect(pricingZoneCode(' Lagos ')).toBe('lagos');
    expect(orderRef('0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11')).toBe('0B9D1B8E');
  });
});

describe('cart lines', () => {
  it('merges equal selections regardless of option order', () => {
    expect(selectionKey('i', ['b', 'a'])).toBe(selectionKey('i', ['a', 'b']));
    const one = addLine([], { id: 'l1', itemId: 'i', quantity: 1, optionIds: ['a', 'b'] });
    const two = addLine(one, { id: 'l2', itemId: 'i', quantity: 2, optionIds: ['b', 'a'] });
    expect(two).toEqual([{ id: 'l1', itemId: 'i', quantity: 3, optionIds: ['a', 'b'] }]);
    expect(addLine(two, { id: 'l3', itemId: 'j', quantity: 1, optionIds: [] })).toHaveLength(2);
  });

  it('enforces quantity and line limits', () => {
    const full = addLine([], { id: 'l1', itemId: 'i', quantity: 50, optionIds: [] });
    expect(() => addLine(full, { id: 'x', itemId: 'i', quantity: 1, optionIds: [] })).toThrow();
    let lines = full;
    for (let n = 0; n < 29; n++) lines = addLine(lines, { id: `n${n}`, itemId: `i${n}`, quantity: 1, optionIds: [] });
    expect(() => addLine(lines, { id: 'y', itemId: 'zz', quantity: 1, optionIds: [] })).toThrow();
  });
});
