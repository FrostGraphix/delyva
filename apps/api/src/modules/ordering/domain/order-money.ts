import { Money } from '@delyva/utils';
import { OrderingError } from './ordering-errors.js';

/** Server-computed order totals in kobo, frozen at checkout. */
export interface OrderTotalsMinor {
  readonly itemsSubtotal: number;
  readonly deliveryFee: number;
  readonly surgeFee: number;
  readonly smallOrderFee: number;
  readonly serviceFee: number;
  readonly discount: number;
  readonly vat: number;
  readonly total: number;
}

/** Commercial terms used for the split (basis points, configurable). */
export interface SplitTerms {
  /** Platform commission on the items subtotal (introductory 0). */
  readonly vendorCommissionBps: number;
  /** Rider share of delivery + surge fees. */
  readonly riderDeliveryShareBps: number;
}

/** The split handed to payments' captureOrderSplit (all NGN). */
export interface OrderSplit {
  readonly customerPaid: Money;
  readonly vendor: Money;
  readonly rider: Money;
  readonly platformFee: Money;
  readonly tax: Money;
  readonly promo: Money;
}

const BPS = 10_000n;

/** floor(amount × bps / 10 000) with BigInt (no float drift). */
export function bpsFloor(amountMinor: number, bps: number): number {
  return Number((BigInt(amountMinor) * BigInt(bps)) / BPS);
}

/** Checks the totals identity `total = subtotal + fees + vat − discount`. */
export function assertTotalsBalance(t: OrderTotalsMinor): void {
  const fees = t.deliveryFee + t.surgeFee + t.smallOrderFee + t.serviceFee;
  const expected = t.itemsSubtotal + fees + t.vat - t.discount;
  if (expected !== t.total || t.total <= 0) {
    throw new OrderingError('validation_failed', 'Order totals do not balance.');
  }
}

/**
 * Splits a delivered order:
 * - vendor = items − commission
 * - rider = floor((delivery + surge) × share)
 * - platform = commission + service + small-order + (delivery + surge − rider)
 * - tax = VAT; promo = discount (platform-funded)
 * so that customerPaid + promo = vendor + rider + platform + tax (payments re-checks this).
 */
export function splitOrder(t: OrderTotalsMinor, terms: SplitTerms): OrderSplit {
  assertTotalsBalance(t);
  const commission = bpsFloor(t.itemsSubtotal, terms.vendorCommissionBps);
  const delivery = t.deliveryFee + t.surgeFee;
  const rider = bpsFloor(delivery, terms.riderDeliveryShareBps);
  const platform = commission + t.serviceFee + t.smallOrderFee + (delivery - rider);
  const ngn = (minor: number) => Money.ofMinor(minor, 'NGN');
  return {
    customerPaid: ngn(t.total),
    vendor: ngn(t.itemsSubtotal - commission),
    rider: ngn(rider),
    platformFee: ngn(platform),
    tax: ngn(t.vat),
    promo: ngn(t.discount),
  };
}

/**
 * Maps a geo delivery zone to the pricing context's zone code (ADR 0500): the lower-cased,
 * trimmed city of the zone (`Lagos` → `lagos`). One fee rule per city until per-zone pricing.
 */
export function pricingZoneCode(city: string): string {
  return city.trim().toLowerCase();
}

/** Short human reference shown to customers and vendors (matches notifications' fallback). */
export function orderRef(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}
