import { z } from 'zod';

/** Upper bound for any amount in minor units (₦10bn) — keeps integer maths far from 2^53. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000;

/** Non-negative integer amount in minor units (kobo for NGN). Never a float. */
export const AmountMinorSchema = z.number().int().min(0).max(MAX_AMOUNT_MINOR);

/** Basis points (1/100 of a percent): 750 = 7.5 %, 10_000 = 100 %. */
export const BasisPointsSchema = z.number().int().min(0).max(100_000);

/** Pricing currency (NGN at launch). */
export const PricingCurrencySchema = z.enum(['NGN']);
/** Pricing currency. */
export type PricingCurrency = z.infer<typeof PricingCurrencySchema>;

/** Zone code, e.g. `lagos` or `lagos-island`. */
export const ZoneCodeSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, 'Zone code: lowercase letters, digits, _ or -');

/** Day of week, 0 = Sunday … 6 = Saturday, in the zone's local time (Africa/Lagos). */
export const DayOfWeekSchema = z.number().int().min(0).max(6);

/** WGS84 coordinate. */
export const LatLngSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
/** WGS84 coordinate. */
export type LatLngDto = z.infer<typeof LatLngSchema>;

/** Path parameter `{id}` (UUID). */
export const IdParamSchema = z.uuid();
