import type { MenuItem, VendorSummary } from '@delyva/contracts';
import { orderRows, quoteRows } from './breakdown';
import { formatMinor, nairaInputToMinor } from './money';
import {
  checkSelections,
  emptySelections,
  previewMinor,
  selectedOptionIds,
  toggleOption,
} from './modifiers';
import { maskPhone, toNigeriaE164 } from './phone';
import { filterVendors, pushRecent } from './search';
import { nearestArea } from './service-areas';
import { canCustomerCancel, isActiveOrder, showsDeliveryOtp, trackingStep } from './tracking';

const ngn = (amountMinor: number): { amountMinor: number; currency: 'NGN' } => ({
  amountMinor,
  currency: 'NGN',
});
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const item: MenuItem = {
  id: uuid(1),
  categoryId: uuid(2),
  name: 'Party jollof',
  description: null,
  price: ngn(350_000),
  available: true,
  modifierGroups: [
    {
      id: uuid(10),
      name: 'Protein',
      minSelect: 1,
      maxSelect: 2,
      options: [
        { id: uuid(11), name: 'Beef', priceDelta: ngn(50_000), available: true },
        { id: uuid(12), name: 'Chicken', priceDelta: ngn(120_000), available: true },
        { id: uuid(13), name: 'Fish', priceDelta: ngn(100_000), available: true },
        { id: uuid(14), name: 'Gone', priceDelta: ngn(0), available: false },
      ],
    },
  ],
};
const group = item.modifierGroups[0];
if (!group) throw new Error('fixture');

describe('modifier selection', () => {
  it('flags a required group with no choice and clears once satisfied', () => {
    const empty = emptySelections(item);
    expect(checkSelections(item, empty)).toMatchObject({
      valid: false,
      problems: { [uuid(10)]: { kind: 'min', count: 1 } },
    });
    const one = toggleOption(group, empty, uuid(11));
    expect(checkSelections(item, one).valid).toBe(true);
  });

  it('ignores taps beyond maxSelect and on unavailable options', () => {
    let s = emptySelections(item);
    s = toggleOption(group, s, uuid(11));
    s = toggleOption(group, s, uuid(12));
    s = toggleOption(group, s, uuid(13));
    expect(s[uuid(10)]).toEqual([uuid(11), uuid(12)]);
    expect(toggleOption(group, s, uuid(14))).toBe(s);
  });

  it('deselects on a second tap and previews price x quantity', () => {
    let s = toggleOption(group, emptySelections(item), uuid(12));
    expect(previewMinor(item, s, 2)).toBe((350_000 + 120_000) * 2);
    expect(selectedOptionIds(item, s)).toEqual([uuid(12)]);
    s = toggleOption(group, s, uuid(12));
    expect(s[uuid(10)]).toEqual([]);
  });

  it('acts as a radio for single-choice groups', () => {
    const single = { ...group, maxSelect: 1 };
    let s = toggleOption(single, emptySelections(item), uuid(11));
    s = toggleOption(single, s, uuid(12));
    expect(s[uuid(10)]).toEqual([uuid(12)]);
  });

  it('reports a max problem when over the limit', () => {
    const over = { [uuid(10)]: [uuid(11), uuid(12), uuid(13)] };
    expect(checkSelections(item, over).problems[uuid(10)]).toEqual({ kind: 'max', count: 2 });
  });
});

describe('money', () => {
  it('formats kobo with naira grouping and parses naira input', () => {
    expect(formatMinor(250_000)).toBe('₦2,500.00');
    expect(nairaInputToMinor('2,500')).toBe(250_000);
    expect(nairaInputToMinor('abc')).toBeNull();
    expect(nairaInputToMinor('0')).toBeNull();
  });
});

describe('breakdown', () => {
  it('shows only non-zero optional fees and a negative discount, total last', () => {
    const rows = quoteRows({
      currency: 'NGN',
      zoneCode: 'lagos',
      distanceMeters: 1000,
      itemsSubtotalMinor: 350_000,
      deliveryFeeMinor: 60_000,
      surgeMultiplierBps: 10_000,
      surgeFeeMinor: 0,
      smallOrderFeeMinor: 0,
      serviceFeeMinor: 20_000,
      discountMinor: 50_000,
      vatMinor: 0,
      totalMinor: 380_000,
      promo: null,
      computedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(rows.map((r) => r.key)).toEqual([
      'price.items',
      'price.delivery',
      'price.service',
      'price.discount',
      'price.total',
    ]);
    expect(rows.find((r) => r.key === 'price.discount')?.amountMinor).toBe(-50_000);
    expect(rows.at(-1)).toMatchObject({ key: 'price.total', amountMinor: 380_000, emphasis: true });
  });

  it('builds receipt rows from order totals', () => {
    const rows = orderRows({
      itemsSubtotal: ngn(100),
      deliveryFee: ngn(10),
      surgeFee: ngn(5),
      smallOrderFee: ngn(0),
      serviceFee: ngn(2),
      discount: ngn(0),
      vat: ngn(1),
      total: ngn(118),
    });
    expect(rows.map((r) => r.key)).toContain('price.surge');
    expect(rows.map((r) => r.key)).toContain('price.vat');
  });
});

describe('phone', () => {
  it('normalises local formats to E.164 and rejects junk', () => {
    expect(toNigeriaE164('0803 123 4567')).toBe('+2348031234567');
    expect(toNigeriaE164('8031234567')).toBe('+2348031234567');
    expect(toNigeriaE164('+234 803 123 4567')).toBe('+2348031234567');
    expect(toNigeriaE164('12345')).toBeNull();
    expect(maskPhone('+2348031234567')).toBe('+234 803 *** 4567');
  });
});

describe('search', () => {
  const v = (name: string, category: VendorSummary['category']): VendorSummary => ({
    id: uuid(name.length),
    name,
    category,
    branchId: uuid(1),
    zoneId: uuid(2),
    distanceMeters: 100,
    etaMinutes: 20,
    deliveryFee: null,
  });
  const vendors = [v('Jollof Junction', 'restaurant'), v('CarePoint Pharmacy', 'pharmacy')];
  it('matches names and categories accent-insensitively; empty query is empty', () => {
    expect(filterVendors(vendors, 'jollof', (c) => c)).toHaveLength(1);
    expect(filterVendors(vendors, 'PHARMACY', (c) => c)[0]?.name).toBe('CarePoint Pharmacy');
    expect(filterVendors(vendors, '  ', (c) => c)).toEqual([]);
    expect(filterVendors(vendors, 'zzz', (c) => c)).toEqual([]);
  });
  it('keeps recents deduped, newest first and capped', () => {
    expect(pushRecent(['suya', 'rice'], 'Suya', 8)).toEqual(['Suya', 'rice']);
    expect(pushRecent(['a1', 'b1'], 'c1', 2)).toEqual(['c1', 'a1']);
    expect(pushRecent(['a1'], 'x', 8)).toEqual(['a1']);
  });
});

describe('tracking', () => {
  it('maps statuses to the 5-step bar and gates cancel/OTP', () => {
    expect(trackingStep('PLACED')).toBe(0);
    expect(trackingStep('PREPARING')).toBe(1);
    expect(trackingStep('RIDER_ASSIGNED')).toBe(2);
    expect(trackingStep('PICKED_UP')).toBe(3);
    expect(trackingStep('DELIVERED')).toBe(4);
    expect(trackingStep('CANCELLED_BY_CUSTOMER')).toBe(-1);
    expect(canCustomerCancel('VENDOR_ACCEPTED')).toBe(true);
    expect(canCustomerCancel('PREPARING')).toBe(false);
    expect(isActiveOrder('PICKED_UP')).toBe(true);
    expect(isActiveOrder('DELIVERED')).toBe(false);
    expect(showsDeliveryOtp('PICKED_UP')).toBe(true);
    expect(showsDeliveryOtp('PLACED')).toBe(false);
  });
});

describe('service areas', () => {
  it('labels a point with the nearest launch area', () => {
    expect(nearestArea(6.444, 3.48)?.id).toBe('lekki');
  });
});
