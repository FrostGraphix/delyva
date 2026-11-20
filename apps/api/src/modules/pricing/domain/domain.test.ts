import { describe, expect, it } from 'vitest';
import { deliveryFeeMinor, type FeeRuleConfig, feeRuleIssues } from './fee-rule.js';
import { calculatePriceQuote, itemsSubtotalMinor, type PriceQuoteInput } from './price-quote.js';
import { PricingError } from './pricing-errors.js';
import {
  evaluatePromo,
  type PromoConfig,
  type PromoContext,
  promoDiscountMinor,
  promoIssues,
} from './promo.js';
import { applyBpsFloor, applyBpsHalfUp, clamp } from './rounding.js';
import {
  lagosLocalTime,
  surgeMultiplierBps,
  type SurgeRuleConfig,
  surgeRuleIssues,
} from './surge.js';

/** Wednesday 2026-11-18 10:00 Lagos (09:00Z): no surge window. */
const WED_10 = new Date('2026-11-18T09:00:00Z');
/** Wednesday 13:00 Lagos: lunch surge. */
const WED_13 = new Date('2026-11-18T12:00:00Z');
/** Saturday 2026-11-21 12:00 Lagos. */
const SAT_12 = new Date('2026-11-21T11:00:00Z');

const rule: FeeRuleConfig = {
  zoneCode: 'lagos',
  currency: 'NGN',
  baseFeeMinor: 30_000,
  baseDistanceMeters: 3_000,
  tiers: [
    { upToMeters: 8_000, perKmMinor: 10_000 },
    { upToMeters: 15_000, perKmMinor: 15_000 },
    { upToMeters: null, perKmMinor: 20_000 },
  ],
  minFeeMinor: 30_000,
  maxFeeMinor: 350_000,
  maxDistanceMeters: 25_000,
  smallOrderThresholdMinor: 200_000,
  smallOrderFeeMinor: 20_000,
  serviceFeeBps: 500,
  serviceFeeCapMinor: 50_000,
  vatBps: 750,
  maxSurgeBps: 15_000,
  active: true,
};

const surge = (over: Partial<SurgeRuleConfig> = {}): SurgeRuleConfig => ({
  zoneCode: 'lagos',
  daysOfWeek: [1, 2, 3, 4, 5],
  startMinute: 720,
  endMinute: 840,
  multiplierBps: 12_000,
  active: true,
  ...over,
});

const promo = (over: Partial<PromoConfig> = {}): PromoConfig => ({
  id: '00000000-0000-4000-8000-000000000001',
  code: 'TEST',
  type: 'fixed_off',
  valueMinor: 50_000,
  percentBps: null,
  maxDiscountMinor: null,
  minOrderMinor: 0,
  audience: 'all',
  startsAt: new Date('2026-01-01T00:00:00Z'),
  endsAt: new Date('2027-01-01T00:00:00Z'),
  activeDaysOfWeek: null,
  perUserLimit: 1,
  globalLimit: null,
  budgetMinor: null,
  active: true,
  redemptionCount: 0,
  spentMinor: 0,
  ...over,
});

const ctx = (over: Partial<PromoContext> = {}): PromoContext => ({
  now: WED_10,
  itemsSubtotalMinor: 500_000,
  isNewCustomer: true,
  userRedemptionCount: 0,
  ...over,
});

const line = (unitPriceMinor: number, quantity = 1, modifierDeltasMinor: number[] = []) => ({
  unitPriceMinor,
  quantity,
  modifierDeltasMinor,
});

const input = (over: Partial<PriceQuoteInput> = {}): PriceQuoteInput => ({
  zoneCode: 'lagos',
  lines: [line(150_000, 2, [20_000]), line(50_000)],
  distanceMeters: 5_500,
  at: WED_10,
  feeRule: rule,
  surgeRules: [surge(), surge({ startMinute: 1080, endMinute: 1260, multiplierBps: 13_000 })],
  promo: null,
  ...over,
});

describe('rounding', () => {
  it('rounds fees half up to the kobo', () => {
    expect(applyBpsHalfUp(15, 750)).toBe(1); // 1.125
    expect(applyBpsHalfUp(20, 750)).toBe(2); // 1.5
    expect(applyBpsHalfUp(79_500, 750)).toBe(5_963); // 5962.5
    expect(applyBpsHalfUp(0, 750)).toBe(0);
  });

  it('rounds discounts down so they never exceed the stated rate', () => {
    expect(applyBpsFloor(999, 1_000)).toBe(99);
    expect(applyBpsFloor(1_000, 1_000)).toBe(100);
  });

  it('stays exact above 2^53 intermediate products', () => {
    expect(applyBpsHalfUp(1_000_000_000_000, 99_999)).toBe(9_999_900_000_000);
  });

  it('rejects floats and negatives', () => {
    expect(() => applyBpsHalfUp(1.5, 750)).toThrow(RangeError);
    expect(() => applyBpsFloor(10, -1)).toThrow(RangeError);
  });

  it('clamps into range', () => {
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(25, 10, 20)).toBe(20);
    expect(clamp(15, 10, 20)).toBe(15);
  });
});

describe('delivery fee tiers', () => {
  it('charges the ₦300 base within 3 km', () => {
    expect(deliveryFeeMinor(rule, 0)).toBe(30_000);
    expect(deliveryFeeMinor(rule, 3_000)).toBe(30_000);
  });

  it('charges each started km beyond the base', () => {
    expect(deliveryFeeMinor(rule, 3_001)).toBe(40_000);
    expect(deliveryFeeMinor(rule, 4_000)).toBe(40_000);
    expect(deliveryFeeMinor(rule, 4_001)).toBe(50_000);
  });

  it('prices each km by the tier it starts in', () => {
    // 5 km in tier 1 (3–8 km) = 50_000; km starting at 8 km is tier 2.
    expect(deliveryFeeMinor(rule, 8_000)).toBe(80_000);
    expect(deliveryFeeMinor(rule, 8_001)).toBe(95_000);
    // 7 km in tier 2 = 105_000; then unbounded tier at 20_000/km.
    expect(deliveryFeeMinor(rule, 15_000)).toBe(185_000);
    expect(deliveryFeeMinor(rule, 16_000)).toBe(205_000);
  });

  it('clamps to the min and max caps', () => {
    expect(deliveryFeeMinor({ ...rule, baseFeeMinor: 10_000 }, 1_000)).toBe(30_000);
    expect(deliveryFeeMinor(rule, 20_000)).toBe(285_000); // 30k + 50k + 105k + 5×20k
    expect(deliveryFeeMinor(rule, 25_000)).toBe(350_000); // 385k raw, capped
    expect(deliveryFeeMinor({ ...rule, maxFeeMinor: 200_000 }, 25_000)).toBe(200_000);
  });

  it('falls back to the last tier rate when tiers stop short (defensive)', () => {
    const short = { ...rule, tiers: [{ upToMeters: 4_000, perKmMinor: 10_000 }] };
    expect(deliveryFeeMinor(short, 5_000)).toBe(50_000);
    expect(deliveryFeeMinor({ ...rule, tiers: [] }, 4_000)).toBe(30_000);
  });

  it('accepts a valid rule and reports every broken invariant', () => {
    expect(feeRuleIssues(rule)).toEqual([]);
    expect(feeRuleIssues({ ...rule, tiers: [], maxDistanceMeters: 3_000 })).toEqual([]);
    const issues = feeRuleIssues({
      ...rule,
      minFeeMinor: 400_000,
      baseDistanceMeters: 30_000,
      maxSurgeBps: 9_000,
      tiers: [
        { upToMeters: null, perKmMinor: 1 },
        { upToMeters: 2_000, perKmMinor: 1 },
      ],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        'tiers[0]: only the last tier may be unbounded',
        'tiers[1]: upToMeters must increase and exceed baseDistanceMeters',
        'tiers must cover distances up to maxDistanceMeters',
        'minFeeMinor must not exceed maxFeeMinor',
        'baseDistanceMeters must not exceed maxDistanceMeters',
        'maxSurgeBps must be at least 10000 (1.0x)',
      ]),
    );
  });
});

describe('surge', () => {
  it('converts instants to Lagos local weekday and minute (UTC+1)', () => {
    expect(lagosLocalTime(WED_10)).toEqual({ dayOfWeek: 3, minuteOfDay: 600 });
    // Sunday 23:30Z is Monday 00:30 in Lagos.
    expect(lagosLocalTime(new Date('2026-11-22T23:30:00Z'))).toEqual({
      dayOfWeek: 1,
      minuteOfDay: 30,
    });
  });

  it('returns 1.0x outside any window and treats the end minute as exclusive', () => {
    expect(surgeMultiplierBps([surge()], 'lagos', WED_10, 15_000)).toBe(10_000);
    expect(surgeMultiplierBps([surge()], 'lagos', new Date('2026-11-18T13:00:00Z'), 15_000)).toBe(
      10_000,
    );
    expect(surgeMultiplierBps([surge()], 'lagos', WED_13, 15_000)).toBe(12_000);
    expect(surgeMultiplierBps([surge()], 'lagos', SAT_12, 15_000)).toBe(10_000);
  });

  it('takes the highest matching rule without compounding, and caps it', () => {
    const rules = [surge(), surge({ multiplierBps: 14_000 }), surge({ multiplierBps: 30_000 })];
    expect(surgeMultiplierBps(rules.slice(0, 2), 'lagos', WED_13, 15_000)).toBe(14_000);
    expect(surgeMultiplierBps(rules, 'lagos', WED_13, 15_000)).toBe(15_000);
  });

  it('ignores inactive rules and other zones', () => {
    const rules = [surge({ active: false }), surge({ zoneCode: 'abuja', multiplierBps: 20_000 })];
    expect(surgeMultiplierBps(rules, 'lagos', WED_13, 15_000)).toBe(10_000);
  });

  it('validates windows, multiplier and days', () => {
    expect(surgeRuleIssues(surge())).toEqual([]);
    expect(
      surgeRuleIssues(
        surge({ startMinute: 900, endMinute: 800, multiplierBps: 9_000, daysOfWeek: [1, 1] }),
      ),
    ).toHaveLength(3);
    expect(surgeRuleIssues(surge({ endMinute: 1_441 }))).toHaveLength(1);
  });
});

describe('promo eligibility', () => {
  it('accepts an eligible promo and reports remaining budget', () => {
    expect(evaluatePromo(promo(), ctx())).toEqual({ eligible: true, remainingBudgetMinor: null });
    expect(evaluatePromo(promo({ budgetMinor: 100_000, spentMinor: 70_000 }), ctx())).toEqual({
      eligible: true,
      remainingBudgetMinor: 30_000,
    });
  });

  it.each([
    ['inactive', promo({ active: false }), ctx()],
    ['not_started', promo({ startsAt: new Date('2026-12-01T00:00:00Z') }), ctx()],
    ['expired', promo({ endsAt: WED_10 }), ctx()],
    ['not_valid_today', promo({ activeDaysOfWeek: [0, 6] }), ctx()],
    ['audience_mismatch', promo({ audience: 'new_users' }), ctx({ isNewCustomer: false })],
    ['min_order_not_met', promo({ minOrderMinor: 500_001 }), ctx()],
    ['per_user_limit_reached', promo({ perUserLimit: 2 }), ctx({ userRedemptionCount: 2 })],
    ['global_limit_reached', promo({ globalLimit: 10, redemptionCount: 10 }), ctx()],
    ['budget_exhausted', promo({ budgetMinor: 100_000, spentMinor: 100_000 }), ctx()],
  ] as const)('rejects with %s', (reason, p, c) => {
    expect(evaluatePromo(p, c)).toEqual({ eligible: false, reason });
  });

  it('is valid on its start instant and on allowed weekdays', () => {
    expect(evaluatePromo(promo({ startsAt: WED_10 }), ctx()).eligible).toBe(true);
    expect(evaluatePromo(promo({ activeDaysOfWeek: [0, 6] }), ctx({ now: SAT_12 })).eligible).toBe(
      true,
    );
    expect(evaluatePromo(promo({ minOrderMinor: 500_000 }), ctx()).eligible).toBe(true);
  });

  it('reports the first failing rule in a fixed order', () => {
    const p = promo({ active: false, minOrderMinor: 10_000_000, audience: 'new_users' });
    expect(evaluatePromo(p, ctx({ isNewCustomer: false }))).toEqual({
      eligible: false,
      reason: 'inactive',
    });
  });

  it('validates promo definitions', () => {
    expect(promoIssues(promo())).toEqual([]);
    expect(promoIssues(promo({ startsAt: WED_10, endsAt: WED_10 }))).toHaveLength(1);
    expect(promoIssues(promo({ valueMinor: null }))).toHaveLength(1);
    expect(promoIssues(promo({ valueMinor: 0 }))).toHaveLength(1);
    expect(promoIssues(promo({ type: 'percent_off', percentBps: null }))).toHaveLength(2);
    expect(
      promoIssues(promo({ type: 'percent_off', percentBps: 20_000, maxDiscountMinor: 1 })),
    ).toHaveLength(1);
    expect(
      promoIssues(promo({ type: 'percent_off', percentBps: 0, maxDiscountMinor: 1 })),
    ).toHaveLength(1);
    expect(promoIssues(promo({ type: 'free_delivery', valueMinor: null }))).toEqual([]);
  });

  it('computes discounts per type with caps', () => {
    const base = { itemsSubtotalMinor: 300_000, deliveryChargeMinor: 72_000 };
    expect(promoDiscountMinor(promo({ type: 'free_delivery' }), base)).toBe(72_000);
    expect(promoDiscountMinor(promo(), base)).toBe(50_000);
    expect(promoDiscountMinor(promo({ valueMinor: 999_999 }), base)).toBe(300_000);
    const pct = promo({ type: 'percent_off', percentBps: 1_050, maxDiscountMinor: 100_000 });
    expect(promoDiscountMinor(pct, base)).toBe(31_500);
    expect(promoDiscountMinor({ ...pct, maxDiscountMinor: 20_000 }, base)).toBe(20_000);
    expect(promoDiscountMinor({ ...pct, maxDiscountMinor: null }, base)).toBe(31_500);
    expect(promoDiscountMinor({ ...pct, percentBps: null }, base)).toBe(0);
    expect(promoDiscountMinor({ ...promo(), valueMinor: null }, base)).toBe(0);
  });
});

describe('calculatePriceQuote', () => {
  it('itemises a Lagos order with VAT on platform fees', () => {
    const q = calculatePriceQuote(input());
    expect({
      subtotal: q.itemsSubtotal.minor,
      delivery: q.deliveryFee.minor,
      surgeBps: q.surgeMultiplierBps,
      surge: q.surgeFee.minor,
      small: q.smallOrderFee.minor,
      service: q.serviceFee.minor,
      discount: q.discount.minor,
      vat: q.vat.minor,
      total: q.total.minor,
    }).toEqual({
      subtotal: 390_000,
      delivery: 60_000,
      surgeBps: 10_000,
      surge: 0,
      small: 0,
      service: 19_500,
      discount: 0,
      vat: 5_963,
      total: 475_463,
    });
    expect(q.total.currency).toBe('NGN');
    expect(q.distanceMeters).toBe(5_500);
  });

  it('adds capped surge as a separate line during peaks', () => {
    const q = calculatePriceQuote(input({ at: WED_13 }));
    expect(q.surgeMultiplierBps).toBe(12_000);
    expect(q.surgeFee.minor).toBe(12_000);
    expect(q.vat.minor).toBe(6_863);
    const capped = calculatePriceQuote(
      input({ at: WED_13, surgeRules: [surge({ multiplierBps: 50_000 })] }),
    );
    expect(capped.surgeMultiplierBps).toBe(15_000);
    expect(capped.surgeFee.minor).toBe(30_000);
  });

  it('charges the small-order fee below the threshold and caps the service fee', () => {
    const small = calculatePriceQuote(input({ lines: [line(199_999)] }));
    expect(small.smallOrderFee.minor).toBe(20_000);
    const exact = calculatePriceQuote(input({ lines: [line(200_000)] }));
    expect(exact.smallOrderFee.minor).toBe(0);
    const big = calculatePriceQuote(input({ lines: [line(5_000_000, 3)] }));
    expect(big.serviceFee.minor).toBe(50_000);
  });

  it('omits VAT when the zone has none configured', () => {
    expect(calculatePriceQuote(input({ feeRule: { ...rule, vatBps: 0 } })).vat.minor).toBe(0);
  });

  it('waives delivery and surge for free_delivery and reduces VAT accordingly', () => {
    const q = calculatePriceQuote(
      input({
        at: WED_13,
        promo: { promo: promo({ type: 'free_delivery' }), remainingBudgetMinor: null },
      }),
    );
    expect(q.discount.minor).toBe(72_000);
    expect(q.vat.minor).toBe(applyBpsHalfUp(19_500, 750));
    expect(q.total.minor).toBe(390_000 + 19_500 + 1_463);
  });

  it('applies item discounts without touching VAT', () => {
    const q = calculatePriceQuote(input({ promo: { promo: promo(), remainingBudgetMinor: null } }));
    expect(q.discount.minor).toBe(50_000);
    expect(q.vat.minor).toBe(5_963);
    expect(q.total.minor).toBe(425_463);
  });

  it('clamps the discount to the remaining budget', () => {
    const partial = calculatePriceQuote(
      input({ promo: { promo: promo(), remainingBudgetMinor: 12_345 } }),
    );
    expect(partial.discount.minor).toBe(12_345);
    const none = calculatePriceQuote(
      input({ promo: { promo: promo(), remainingBudgetMinor: -5 } }),
    );
    expect(none.discount.minor).toBe(0);
  });

  it('rejects out-of-range addresses, inactive or mismatched zones', () => {
    const codeOf = (i: PriceQuoteInput): string => {
      try {
        calculatePriceQuote(i);
        return 'ok';
      } catch (e) {
        return (e as PricingError).code;
      }
    };
    expect(codeOf(input({ distanceMeters: 25_001 }))).toBe('zone_not_serviceable');
    expect(codeOf(input({ feeRule: { ...rule, active: false } }))).toBe('zone_not_serviceable');
    expect(codeOf(input({ zoneCode: 'abuja' }))).toBe('zone_not_serviceable');
    expect(codeOf(input({ distanceMeters: 25_000 }))).toBe('ok');
  });

  it('rejects empty carts and negative line prices', () => {
    expect(() => itemsSubtotalMinor([])).toThrow(PricingError);
    expect(() => itemsSubtotalMinor([line(1_000, 1, [-2_000])])).toThrow(/negative/);
    expect(itemsSubtotalMinor([line(1_000, 3, [500, -200])])).toBe(3_900);
  });

  it('holds its invariants for 2,000 pseudo-random carts (property test)', () => {
    let seed = 42;
    const rand = (max: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed % (max + 1);
    };
    const types = ['free_delivery', 'percent_off', 'fixed_off'] as const;
    for (let i = 0; i < 2_000; i++) {
      const lines = Array.from({ length: 1 + rand(4) }, () =>
        line(rand(2_000_000), 1 + rand(9), [rand(50_000)]),
      );
      const p = promo({
        type: types[rand(2)] ?? 'fixed_off',
        valueMinor: rand(200_000),
        percentBps: rand(10_000),
        maxDiscountMinor: rand(300_000),
      });
      const q = calculatePriceQuote(
        input({
          lines,
          distanceMeters: rand(25_000),
          at: new Date(WED_10.getTime() + rand(7 * 24 * 60) * 60_000),
          promo:
            rand(1) === 1
              ? { promo: p, remainingBudgetMinor: rand(1) ? null : rand(100_000) }
              : null,
        }),
      );
      const charges =
        q.itemsSubtotal.minor +
        q.deliveryFee.minor +
        q.surgeFee.minor +
        q.smallOrderFee.minor +
        q.serviceFee.minor +
        q.vat.minor;
      expect(q.total.minor).toBe(charges - q.discount.minor);
      expect(q.total.minor).toBeGreaterThanOrEqual(0);
      expect(q.deliveryFee.minor).toBeGreaterThanOrEqual(rule.minFeeMinor);
      expect(q.deliveryFee.minor).toBeLessThanOrEqual(rule.maxFeeMinor);
      expect(q.surgeFee.minor).toBeLessThanOrEqual(applyBpsHalfUp(q.deliveryFee.minor, 5_000));
      expect(q.serviceFee.minor).toBeLessThanOrEqual(rule.serviceFeeCapMinor);
      for (const m of [q.total, q.vat, q.discount]) expect(Number.isInteger(m.minor)).toBe(true);
    }
  });
});
