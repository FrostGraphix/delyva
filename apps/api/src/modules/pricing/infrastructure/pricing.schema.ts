import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DistanceTierConfig } from '../domain/fee-rule.js';

const kobo = (name: string) => bigint(name, { mode: 'number' });

/** Delivery fee configuration, one row per zone. Amounts in kobo, rates in basis points. */
export const feeRules = pgTable(
  'fee_rules',
  {
    id: uuid('id').primaryKey(),
    zoneCode: text('zone_code').notNull().unique(),
    currency: text('currency').notNull().default('NGN'),
    baseFeeMinor: kobo('base_fee_minor').notNull(),
    baseDistanceMeters: integer('base_distance_meters').notNull(),
    tiers: jsonb('tiers').$type<DistanceTierConfig[]>().notNull(),
    minFeeMinor: kobo('min_fee_minor').notNull(),
    maxFeeMinor: kobo('max_fee_minor').notNull(),
    maxDistanceMeters: integer('max_distance_meters').notNull(),
    smallOrderThresholdMinor: kobo('small_order_threshold_minor').notNull(),
    smallOrderFeeMinor: kobo('small_order_fee_minor').notNull(),
    serviceFeeBps: integer('service_fee_bps').notNull(),
    serviceFeeCapMinor: kobo('service_fee_cap_minor').notNull(),
    vatBps: integer('vat_bps').notNull(),
    maxSurgeBps: integer('max_surge_bps').notNull(),
    active: boolean('active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('fee_rules_min_le_max', sql`${t.minFeeMinor} <= ${t.maxFeeMinor}`),
    check('fee_rules_surge_cap', sql`${t.maxSurgeBps} >= 10000`),
  ],
);

/** Time-window surge multipliers per zone (Lagos local time). */
export const surgeRules = pgTable(
  'surge_rules',
  {
    id: uuid('id').primaryKey(),
    zoneCode: text('zone_code').notNull(),
    daysOfWeek: integer('days_of_week').array().notNull(),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    multiplierBps: integer('multiplier_bps').notNull(),
    active: boolean('active').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('surge_rules_zone_idx').on(t.zoneCode),
    check('surge_rules_window', sql`${t.startMinute} < ${t.endMinute} AND ${t.endMinute} <= 1440`),
    check('surge_rules_multiplier', sql`${t.multiplierBps} >= 10000`),
  ],
);

/** Promo codes with usage counters; CHECKs make over-redemption impossible even under races. */
export const promos = pgTable(
  'promos',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull().unique(),
    type: text('type', { enum: ['free_delivery', 'percent_off', 'fixed_off'] }).notNull(),
    valueMinor: kobo('value_minor'),
    percentBps: integer('percent_bps'),
    maxDiscountMinor: kobo('max_discount_minor'),
    minOrderMinor: kobo('min_order_minor').notNull().default(0),
    audience: text('audience', { enum: ['all', 'new_users'] }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    activeDaysOfWeek: integer('active_days_of_week').array(),
    perUserLimit: integer('per_user_limit').notNull().default(1),
    globalLimit: integer('global_limit'),
    budgetMinor: kobo('budget_minor'),
    active: boolean('active').notNull().default(true),
    redemptionCount: integer('redemption_count').notNull().default(0),
    spentMinor: kobo('spent_minor').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('promos_window', sql`${t.startsAt} < ${t.endsAt}`),
    check('promos_budget', sql`${t.budgetMinor} IS NULL OR ${t.spentMinor} <= ${t.budgetMinor}`),
    check(
      'promos_global_limit',
      sql`${t.globalLimit} IS NULL OR ${t.redemptionCount} <= ${t.globalLimit}`,
    ),
  ],
);

/** One row per (promo, order): the UNIQUE constraint makes redemption idempotent. */
export const promoRedemptions = pgTable(
  'promo_redemptions',
  {
    id: uuid('id').primaryKey(),
    promoId: uuid('promo_id')
      .notNull()
      .references(() => promos.id),
    userId: uuid('user_id').notNull(),
    orderId: uuid('order_id').notNull(),
    discountMinor: kobo('discount_minor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('promo_redemptions_promo_order_uq').on(t.promoId, t.orderId),
    index('promo_redemptions_user_idx').on(t.userId, t.promoId),
    check('promo_redemptions_discount_nonneg', sql`${t.discountMinor} >= 0`),
  ],
);
