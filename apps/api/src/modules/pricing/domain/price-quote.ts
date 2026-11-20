import { Money } from '@delyva/utils';
import { deliveryFeeMinor, type FeeRuleConfig } from './fee-rule.js';
import { PricingError } from './pricing-errors.js';
import { type PromoConfig, promoDiscountMinor } from './promo.js';
import { applyBpsHalfUp, BPS_DENOMINATOR } from './rounding.js';
import { surgeMultiplierBps, type SurgeRuleConfig } from './surge.js';

/** One cart line: per-unit price plus per-unit modifier deltas, times quantity. */
export interface QuoteLineInput {
  readonly unitPriceMinor: number;
  readonly quantity: number;
  readonly modifierDeltasMinor: readonly number[];
}

/** An already-eligible promo and how much budget it has left (null = uncapped). */
export interface ApplicablePromo {
  readonly promo: PromoConfig;
  readonly remainingBudgetMinor: number | null;
}

/** Everything the calculator needs; it performs no I/O. */
export interface PriceQuoteInput {
  readonly zoneCode: string;
  readonly lines: readonly QuoteLineInput[];
  readonly distanceMeters: number;
  readonly at: Date;
  readonly feeRule: FeeRuleConfig;
  readonly surgeRules: readonly SurgeRuleConfig[];
  readonly promo: ApplicablePromo | null;
}

/** Itemised breakdown in Money (kobo). `total = subtotal + fees + vat - discount`, never negative. */
export interface PriceQuote {
  readonly zoneCode: string;
  readonly distanceMeters: number;
  readonly itemsSubtotal: Money;
  readonly deliveryFee: Money;
  readonly surgeMultiplierBps: number;
  readonly surgeFee: Money;
  readonly smallOrderFee: Money;
  readonly serviceFee: Money;
  readonly discount: Money;
  readonly vat: Money;
  readonly total: Money;
}

/** Sum of `quantity × (unit + Σ modifier deltas)`; a line whose unit price goes negative is rejected. */
export function itemsSubtotalMinor(lines: readonly QuoteLineInput[]): number {
  if (lines.length === 0)
    throw new PricingError('validation_failed', 'A quote needs at least one line.');
  return lines.reduce((sum, line) => {
    const unit = line.modifierDeltasMinor.reduce((u, d) => u + d, line.unitPriceMinor);
    if (unit < 0) throw new PricingError('validation_failed', 'A line price cannot be negative.');
    return sum + unit * line.quantity;
  }, 0);
}

interface Charges {
  readonly delivery: number;
  readonly surgeBps: number;
  readonly surge: number;
  readonly smallOrder: number;
  readonly service: number;
}

function charges(input: PriceQuoteInput, subtotal: number): Charges {
  const rule = input.feeRule;
  const delivery = deliveryFeeMinor(rule, input.distanceMeters);
  const surgeBps = surgeMultiplierBps(input.surgeRules, input.zoneCode, input.at, rule.maxSurgeBps);
  const surge = applyBpsHalfUp(delivery, surgeBps - BPS_DENOMINATOR);
  const smallOrder = subtotal < rule.smallOrderThresholdMinor ? rule.smallOrderFeeMinor : 0;
  const service = Math.min(applyBpsHalfUp(subtotal, rule.serviceFeeBps), rule.serviceFeeCapMinor);
  return { delivery, surgeBps, surge, smallOrder, service };
}

function discountMinor(promo: ApplicablePromo | null, subtotal: number, c: Charges): number {
  if (!promo) return 0;
  const raw = promoDiscountMinor(promo.promo, {
    itemsSubtotalMinor: subtotal,
    deliveryChargeMinor: c.delivery + c.surge,
  });
  return promo.remainingBudgetMinor === null
    ? raw
    : Math.min(raw, Math.max(0, promo.remainingBudgetMinor));
}

/**
 * Prices a cart. VAT (when `vatBps > 0`) is charged on platform fees only (delivery, surge,
 * small-order, service) after any free-delivery discount; menu prices are VAT-inclusive.
 * @throws PricingError `zone_not_serviceable` when the zone has no active rule or is out of range.
 */
export function calculatePriceQuote(input: PriceQuoteInput): PriceQuote {
  const rule = input.feeRule;
  if (!rule.active || rule.zoneCode !== input.zoneCode) {
    throw new PricingError('zone_not_serviceable', 'Delivery is not available in this zone yet.');
  }
  if (input.distanceMeters > rule.maxDistanceMeters) {
    throw new PricingError('zone_not_serviceable', 'This address is too far for delivery.');
  }
  const subtotal = itemsSubtotalMinor(input.lines);
  const c = charges(input, subtotal);
  const discount = discountMinor(input.promo, subtotal, c);
  const fees = c.delivery + c.surge + c.smallOrder + c.service;
  const feeDiscount = input.promo?.promo.type === 'free_delivery' ? discount : 0;
  const vat = applyBpsHalfUp(fees - feeDiscount, rule.vatBps);
  const ngn = (minor: number): Money => Money.ofMinor(minor, rule.currency);
  return {
    zoneCode: input.zoneCode,
    distanceMeters: input.distanceMeters,
    itemsSubtotal: ngn(subtotal),
    deliveryFee: ngn(c.delivery),
    surgeMultiplierBps: c.surgeBps,
    surgeFee: ngn(c.surge),
    smallOrderFee: ngn(c.smallOrder),
    serviceFee: ngn(c.service),
    discount: ngn(discount),
    vat: ngn(vat),
    total: ngn(subtotal + fees + vat - discount),
  };
}
