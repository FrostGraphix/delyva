import { applyBpsFloor, BPS_DENOMINATOR } from './rounding.js';
import { lagosLocalTime } from './surge.js';

/** Promo discount type. */
export type PromoKind = 'free_delivery' | 'percent_off' | 'fixed_off';

/** Promo definition plus its usage counters. Amounts in kobo, rates in bps. */
export interface PromoConfig {
  readonly id: string;
  readonly code: string;
  readonly type: PromoKind;
  readonly valueMinor: number | null;
  readonly percentBps: number | null;
  readonly maxDiscountMinor: number | null;
  readonly minOrderMinor: number;
  readonly audience: 'all' | 'new_users';
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly activeDaysOfWeek: readonly number[] | null;
  readonly perUserLimit: number;
  readonly globalLimit: number | null;
  readonly budgetMinor: number | null;
  readonly active: boolean;
  readonly redemptionCount: number;
  readonly spentMinor: number;
}

/** Why a promo is not eligible. Mirrors contracts `PromoRejectionReason`. */
export type PromoRejection =
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'not_valid_today'
  | 'min_order_not_met'
  | 'audience_mismatch'
  | 'per_user_limit_reached'
  | 'global_limit_reached'
  | 'budget_exhausted';

/** Facts about the customer and cart needed to check eligibility (all server-derived). */
export interface PromoContext {
  readonly now: Date;
  readonly itemsSubtotalMinor: number;
  readonly isNewCustomer: boolean;
  readonly userRedemptionCount: number;
}

/** Eligibility outcome. `remainingBudgetMinor` is null when the promo has no budget cap. */
export type PromoEligibility =
  | { readonly eligible: true; readonly remainingBudgetMinor: number | null }
  | { readonly eligible: false; readonly reason: PromoRejection };

function windowRejection(p: PromoConfig, now: Date): PromoRejection | null {
  if (!p.active) return 'inactive';
  if (now < p.startsAt) return 'not_started';
  if (now >= p.endsAt) return 'expired';
  if (p.activeDaysOfWeek && !p.activeDaysOfWeek.includes(lagosLocalTime(now).dayOfWeek)) {
    return 'not_valid_today';
  }
  return null;
}

function usageRejection(p: PromoConfig, ctx: PromoContext): PromoRejection | null {
  if (p.audience === 'new_users' && !ctx.isNewCustomer) return 'audience_mismatch';
  if (ctx.itemsSubtotalMinor < p.minOrderMinor) return 'min_order_not_met';
  if (ctx.userRedemptionCount >= p.perUserLimit) return 'per_user_limit_reached';
  if (p.globalLimit !== null && p.redemptionCount >= p.globalLimit) return 'global_limit_reached';
  if (p.budgetMinor !== null && p.spentMinor >= p.budgetMinor) return 'budget_exhausted';
  return null;
}

/**
 * Checks every eligibility rule in a fixed order (window → audience → min order → per-user →
 * global → budget) so the reported reason is deterministic.
 */
export function evaluatePromo(p: PromoConfig, ctx: PromoContext): PromoEligibility {
  const reason = windowRejection(p, ctx.now) ?? usageRejection(p, ctx);
  if (reason) return { eligible: false, reason };
  const remaining = p.budgetMinor === null ? null : p.budgetMinor - p.spentMinor;
  return { eligible: true, remainingBudgetMinor: remaining };
}

/** Invariant violations of a promo definition (empty when valid). */
export function promoIssues(
  p: Omit<PromoConfig, 'id' | 'redemptionCount' | 'spentMinor'>,
): string[] {
  const issues: string[] = [];
  if (p.startsAt >= p.endsAt) issues.push('startsAt must be before endsAt');
  if (p.type === 'fixed_off' && (p.valueMinor === null || p.valueMinor <= 0)) {
    issues.push('fixed_off requires a positive valueMinor');
  }
  if (p.type === 'percent_off') {
    if (p.percentBps === null || p.percentBps <= 0 || p.percentBps > BPS_DENOMINATOR) {
      issues.push('percent_off requires percentBps in 1..10000');
    }
    if (p.maxDiscountMinor === null) issues.push('percent_off requires maxDiscountMinor (cap)');
  }
  return issues;
}

/** Amounts a discount can apply to. */
export interface DiscountBase {
  readonly itemsSubtotalMinor: number;
  readonly deliveryChargeMinor: number;
}

/**
 * Discount in kobo before the budget clamp:
 * - free_delivery: the whole delivery charge (distance fee + surge);
 * - percent_off: floor(subtotal × rate), capped by `maxDiscountMinor`;
 * - fixed_off: `valueMinor`;
 * item discounts never exceed the items subtotal.
 */
export function promoDiscountMinor(p: PromoConfig, base: DiscountBase): number {
  switch (p.type) {
    case 'free_delivery':
      return base.deliveryChargeMinor;
    case 'percent_off': {
      const raw = applyBpsFloor(base.itemsSubtotalMinor, p.percentBps ?? 0);
      return Math.min(raw, p.maxDiscountMinor ?? raw, base.itemsSubtotalMinor);
    }
    case 'fixed_off':
      return Math.min(p.valueMinor ?? 0, base.itemsSubtotalMinor);
  }
}
