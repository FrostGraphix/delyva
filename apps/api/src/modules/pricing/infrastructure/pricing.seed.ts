import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import type { StoredFeeRule, StoredPromo, StoredSurgeRule } from '../application/ports.js';
import { feeRules, promos, surgeRules } from './pricing.schema.js';

/** Launch zone code. */
export const LAGOS_ZONE = 'lagos';

/**
 * Lagos launch fee rule (kobo / bps). Product promise: ₦300 delivery within 3 km.
 * Beyond 3 km each started km costs ₦100 (to 8 km), ₦150 (to 15 km), then ₦200; fee clamped to
 * ₦300–₦3,500; max 25 km. Small-order fee ₦200 below ₦2,000. Service fee 5 % capped at ₦500.
 * VAT 7.5 % on platform fees. Surge capped at 1.5x.
 */
export const LAGOS_FEE_RULE: Omit<StoredFeeRule, 'id' | 'updatedAt'> = {
  zoneCode: LAGOS_ZONE,
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

const WEEKDAYS = [1, 2, 3, 4, 5];

/** Lunch (12:00–14:00, 1.2x) and evening (18:00–21:00, 1.3x) weekday peaks, Lagos time. */
export const LAGOS_SURGE_RULES: Omit<StoredSurgeRule, 'id' | 'updatedAt'>[] = [
  {
    zoneCode: LAGOS_ZONE,
    daysOfWeek: WEEKDAYS,
    startMinute: 720,
    endMinute: 840,
    multiplierBps: 12_000,
    active: true,
  },
  {
    zoneCode: LAGOS_ZONE,
    daysOfWeek: WEEKDAYS,
    startMinute: 1080,
    endMinute: 1260,
    multiplierBps: 13_000,
    active: true,
  },
];

const promoBase = {
  valueMinor: null,
  percentBps: null,
  maxDiscountMinor: null,
  startsAt: new Date('2026-01-01T00:00:00+01:00'),
  endsAt: new Date('2028-01-01T00:00:00+01:00'),
  activeDaysOfWeek: null,
  globalLimit: null,
  active: true,
  redemptionCount: 0,
  spentMinor: 0,
} as const;

/** TUNDE50: ₦500 off a new customer's first order. WEEKEND: free delivery Sat/Sun on ₦3,000+. */
export const LAUNCH_PROMOS: Omit<StoredPromo, 'id' | 'updatedAt'>[] = [
  {
    ...promoBase,
    code: 'TUNDE50',
    type: 'fixed_off',
    valueMinor: 50_000,
    minOrderMinor: 0,
    audience: 'new_users',
    perUserLimit: 1,
    budgetMinor: 500_000_000,
  },
  {
    ...promoBase,
    code: 'WEEKEND',
    type: 'free_delivery',
    minOrderMinor: 300_000,
    audience: 'all',
    activeDaysOfWeek: [0, 6],
    perUserLimit: 8,
    budgetMinor: 200_000_000,
  },
];

/** Idempotent seed: never overwrites rows an admin already created or edited. */
export async function seedPricing(db: Db): Promise<void> {
  await db
    .insert(feeRules)
    .values({ ...LAGOS_FEE_RULE, tiers: [...LAGOS_FEE_RULE.tiers], id: randomUUID() })
    .onConflictDoNothing();
  const existingSurge = await db
    .select({ id: surgeRules.id })
    .from(surgeRules)
    .where(eq(surgeRules.zoneCode, LAGOS_ZONE));
  if (existingSurge.length === 0) {
    await db
      .insert(surgeRules)
      .values(
        LAGOS_SURGE_RULES.map((r) => ({ ...r, daysOfWeek: [...r.daysOfWeek], id: randomUUID() })),
      );
  }
  for (const p of LAUNCH_PROMOS) {
    const days = p.activeDaysOfWeek ? [...p.activeDaysOfWeek] : null;
    await db
      .insert(promos)
      .values({ ...p, activeDaysOfWeek: days, id: randomUUID() })
      .onConflictDoNothing();
  }
}
