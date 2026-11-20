import { z } from 'zod';
import {
  AmountMinorSchema,
  BasisPointsSchema,
  LatLngSchema,
  PricingCurrencySchema,
  ZoneCodeSchema,
} from './common.js';

/** One cart line: unit price, quantity and per-unit modifier deltas (all minor units). */
export const QuoteLineSchema = z.strictObject({
  unitPriceMinor: AmountMinorSchema,
  quantity: z.number().int().min(1).max(99),
  modifierDeltasMinor: z
    .array(z.number().int().min(-10_000_000).max(10_000_000))
    .max(20)
    .default([]),
});
/** One cart line. */
export type QuoteLine = z.infer<typeof QuoteLineSchema>;

/** Promo code as typed by the customer (normalised to upper case on the server). */
export const PromoCodeInputSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9_-]+$/, 'Promo codes contain letters, digits, _ or -');

/** POST /v1/quotes body. */
export const QuoteRequestSchema = z.strictObject({
  zoneCode: ZoneCodeSchema,
  pickup: LatLngSchema,
  dropoff: LatLngSchema,
  lines: z.array(QuoteLineSchema).min(1).max(100),
  promoCode: PromoCodeInputSchema.optional(),
});
/** POST /v1/quotes body. */
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

/** Why a promo did not apply. */
export const PromoRejectionReasonSchema = z.enum([
  'not_found',
  'inactive',
  'not_started',
  'expired',
  'not_valid_today',
  'min_order_not_met',
  'audience_mismatch',
  'per_user_limit_reached',
  'global_limit_reached',
  'budget_exhausted',
]);
/** Why a promo did not apply. */
export type PromoRejectionReason = z.infer<typeof PromoRejectionReasonSchema>;

/** Promo outcome inside a quote. */
export const QuotePromoSchema = z.strictObject({
  code: z.string(),
  applied: z.boolean(),
  reason: PromoRejectionReasonSchema.optional(),
  discountMinor: AmountMinorSchema,
});

/** Itemised price breakdown; every amount is integer minor units. `total = sum(charges) - discount`. */
export const QuoteResponseSchema = z.strictObject({
  currency: PricingCurrencySchema,
  zoneCode: ZoneCodeSchema,
  distanceMeters: z.number().int().nonnegative(),
  itemsSubtotalMinor: AmountMinorSchema,
  deliveryFeeMinor: AmountMinorSchema,
  surgeMultiplierBps: BasisPointsSchema,
  surgeFeeMinor: AmountMinorSchema,
  smallOrderFeeMinor: AmountMinorSchema,
  serviceFeeMinor: AmountMinorSchema,
  discountMinor: AmountMinorSchema,
  vatMinor: AmountMinorSchema,
  totalMinor: AmountMinorSchema,
  promo: QuotePromoSchema.nullable(),
  computedAt: z.iso.datetime(),
});
/** Itemised price breakdown. */
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;
