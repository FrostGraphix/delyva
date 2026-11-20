import { z } from 'zod';
import {
  AmountMinorSchema,
  BasisPointsSchema,
  DayOfWeekSchema,
  PricingCurrencySchema,
  ZoneCodeSchema,
} from './common.js';

/** Distance tier: from the previous tier's end up to `upToMeters` (null = unbounded), per started km. */
export const DistanceTierSchema = z.strictObject({
  upToMeters: z.number().int().positive().max(500_000).nullable(),
  perKmMinor: AmountMinorSchema,
});
/** Distance tier. */
export type DistanceTier = z.infer<typeof DistanceTierSchema>;

const feeRuleFields = {
  baseFeeMinor: AmountMinorSchema,
  baseDistanceMeters: z.number().int().min(0).max(100_000),
  tiers: z.array(DistanceTierSchema).max(10),
  minFeeMinor: AmountMinorSchema,
  maxFeeMinor: AmountMinorSchema,
  maxDistanceMeters: z.number().int().positive().max(500_000),
  smallOrderThresholdMinor: AmountMinorSchema,
  smallOrderFeeMinor: AmountMinorSchema,
  serviceFeeBps: BasisPointsSchema.max(10_000),
  serviceFeeCapMinor: AmountMinorSchema,
  vatBps: BasisPointsSchema.max(10_000),
  maxSurgeBps: BasisPointsSchema.min(10_000),
  active: z.boolean(),
};

/** POST /v1/admin/fee-rules body (one rule per zone). Cross-field invariants are checked server-side. */
export const CreateFeeRuleSchema = z.strictObject({
  zoneCode: ZoneCodeSchema,
  currency: PricingCurrencySchema.default('NGN'),
  ...feeRuleFields,
});
/** POST /v1/admin/fee-rules body. */
export type CreateFeeRule = z.infer<typeof CreateFeeRuleSchema>;

/** PATCH /v1/admin/fee-rules/{id} body. */
export const UpdateFeeRuleSchema = z.strictObject(feeRuleFields).partial();
/** PATCH /v1/admin/fee-rules/{id} body. */
export type UpdateFeeRule = z.infer<typeof UpdateFeeRuleSchema>;

/** Stored fee rule. */
export const FeeRuleSchema = z.strictObject({
  id: z.uuid(),
  zoneCode: ZoneCodeSchema,
  currency: PricingCurrencySchema,
  ...feeRuleFields,
  updatedAt: z.iso.datetime(),
});
/** Stored fee rule. */
export type FeeRule = z.infer<typeof FeeRuleSchema>;

/** GET /v1/admin/fee-rules response. */
export const FeeRuleListSchema = z.strictObject({ items: z.array(FeeRuleSchema) });
/** GET /v1/admin/fee-rules response. */
export type FeeRuleList = z.infer<typeof FeeRuleListSchema>;

const surgeFields = {
  daysOfWeek: z.array(DayOfWeekSchema).min(1).max(7),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  multiplierBps: BasisPointsSchema.min(10_000).max(50_000),
  active: z.boolean(),
};

/** POST /v1/admin/surge-rules body. Window is `[startMinute, endMinute)` in Lagos local time. */
export const CreateSurgeRuleSchema = z.strictObject({ zoneCode: ZoneCodeSchema, ...surgeFields });
/** POST /v1/admin/surge-rules body. */
export type CreateSurgeRule = z.infer<typeof CreateSurgeRuleSchema>;

/** PATCH /v1/admin/surge-rules/{id} body. */
export const UpdateSurgeRuleSchema = z.strictObject(surgeFields).partial();
/** PATCH /v1/admin/surge-rules/{id} body. */
export type UpdateSurgeRule = z.infer<typeof UpdateSurgeRuleSchema>;

/** Stored surge rule. */
export const SurgeRuleSchema = z.strictObject({
  id: z.uuid(),
  zoneCode: ZoneCodeSchema,
  ...surgeFields,
  updatedAt: z.iso.datetime(),
});
/** Stored surge rule. */
export type SurgeRule = z.infer<typeof SurgeRuleSchema>;

/** GET /v1/admin/surge-rules response. */
export const SurgeRuleListSchema = z.strictObject({ items: z.array(SurgeRuleSchema) });
/** GET /v1/admin/surge-rules response. */
export type SurgeRuleList = z.infer<typeof SurgeRuleListSchema>;

/** Promo discount type. */
export const PromoTypeSchema = z.enum(['free_delivery', 'percent_off', 'fixed_off']);
/** Promo discount type. */
export type PromoType = z.infer<typeof PromoTypeSchema>;

/** Who may use a promo. `new_users` = customers with no prior order. */
export const PromoAudienceSchema = z.enum(['all', 'new_users']);
/** Who may use a promo. */
export type PromoAudience = z.infer<typeof PromoAudienceSchema>;

/** Canonical promo code (upper case). */
export const PromoCodeSchema = z.string().regex(/^[A-Z0-9_-]{3,32}$/, 'Upper-case promo code');

const promoFields = {
  type: PromoTypeSchema,
  /** fixed_off amount. */
  valueMinor: AmountMinorSchema.nullable(),
  /** percent_off rate. */
  percentBps: BasisPointsSchema.max(10_000).nullable(),
  /** percent_off cap. */
  maxDiscountMinor: AmountMinorSchema.nullable(),
  minOrderMinor: AmountMinorSchema,
  audience: PromoAudienceSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** Restricts use to these Lagos-local weekdays; null = every day. */
  activeDaysOfWeek: z.array(DayOfWeekSchema).min(1).max(7).nullable(),
  perUserLimit: z.number().int().min(1).max(1000),
  globalLimit: z.number().int().min(1).nullable(),
  budgetMinor: AmountMinorSchema.nullable(),
  active: z.boolean(),
};

/** POST /v1/admin/promos body. */
export const CreatePromoSchema = z.strictObject({ code: PromoCodeSchema, ...promoFields });
/** POST /v1/admin/promos body. */
export type CreatePromo = z.infer<typeof CreatePromoSchema>;

/** PATCH /v1/admin/promos/{id} body (code and type are immutable). */
export const UpdatePromoSchema = z.strictObject(promoFields).omit({ type: true }).partial();
/** PATCH /v1/admin/promos/{id} body. */
export type UpdatePromo = z.infer<typeof UpdatePromoSchema>;

/** Stored promo with usage counters. */
export const PromoSchema = z.strictObject({
  id: z.uuid(),
  code: PromoCodeSchema,
  ...promoFields,
  redemptionCount: z.number().int().nonnegative(),
  spentMinor: AmountMinorSchema,
  updatedAt: z.iso.datetime(),
});
/** Stored promo. */
export type Promo = z.infer<typeof PromoSchema>;

/** GET /v1/admin/promos response. */
export const PromoListSchema = z.strictObject({ items: z.array(PromoSchema) });
/** GET /v1/admin/promos response. */
export type PromoList = z.infer<typeof PromoListSchema>;
