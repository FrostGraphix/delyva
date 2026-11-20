import { PricingError } from '../domain/pricing-errors.js';
import { evaluatePromo } from '../domain/promo.js';
import type {
  Clock,
  LockedPromoScope,
  PromoRedemptionUnitOfWork,
  RedemptionRecord,
} from './ports.js';

/** Input from the ordering module after it has priced the order with {@link PricingService.quote}. */
export interface RedeemPromoCommand {
  readonly code: string;
  readonly userId: string;
  readonly orderId: string;
  readonly itemsSubtotalMinor: number;
  /** Discount the quote granted; re-checked against the remaining budget under lock. */
  readonly discountMinor: number;
}

/** Redemption result; `replayed` = the same order already redeemed this promo (idempotent). */
export interface RedeemPromoResult {
  readonly redemption: RedemptionRecord;
  readonly replayed: boolean;
}

/**
 * Records a promo redemption exactly once per (promo, order). Eligibility is re-evaluated while
 * the promo row is locked, so concurrent redemptions cannot overrun per-user, global or budget
 * limits; DB CHECK/UNIQUE constraints are the last line of defence.
 */
export class RedeemPromo {
  /** @param deps unit of work + clock */
  constructor(private readonly deps: { uow: PromoRedemptionUnitOfWork; clock: Clock }) {}

  /** @throws PricingError not_found | promo_ineligible | conflict */
  async execute(cmd: RedeemPromoCommand): Promise<RedeemPromoResult> {
    if (!Number.isSafeInteger(cmd.discountMinor) || cmd.discountMinor < 0) {
      throw new PricingError('validation_failed', 'discountMinor must be a non-negative integer.');
    }
    const code = cmd.code.trim().toUpperCase();
    const result = await this.deps.uow.withLockedPromo(code, (scope) =>
      this.redeemLocked(scope, cmd),
    );
    if (!result) throw new PricingError('not_found', 'Promo code not found.');
    return result;
  }

  private async redeemLocked(
    scope: LockedPromoScope,
    cmd: RedeemPromoCommand,
  ): Promise<RedeemPromoResult> {
    const existing = await scope.redemptionForOrder(cmd.orderId);
    if (existing) return replay(existing, cmd);
    const eligibility = evaluatePromo(scope.promo, {
      now: this.deps.clock.now(),
      itemsSubtotalMinor: cmd.itemsSubtotalMinor,
      isNewCustomer: await scope.isNewCustomer(cmd.userId),
      userRedemptionCount: await scope.userRedemptionCount(scope.promo.id, cmd.userId),
    });
    if (!eligibility.eligible) {
      throw new PricingError('promo_ineligible', `Promo cannot be applied: ${eligibility.reason}.`);
    }
    const remaining = eligibility.remainingBudgetMinor;
    if (remaining !== null && cmd.discountMinor > remaining) {
      throw new PricingError('promo_ineligible', 'Promo cannot be applied: budget_exhausted.');
    }
    const redemption: RedemptionRecord = {
      id: this.deps.clock.uuid(),
      promoId: scope.promo.id,
      userId: cmd.userId,
      orderId: cmd.orderId,
      discountMinor: cmd.discountMinor,
    };
    await scope.record(redemption);
    return { redemption, replayed: false };
  }
}

function replay(existing: RedemptionRecord, cmd: RedeemPromoCommand): RedeemPromoResult {
  if (existing.userId !== cmd.userId || existing.discountMinor !== cmd.discountMinor) {
    throw new PricingError(
      'conflict',
      'This order already redeemed the promo with different details.',
    );
  }
  return { redemption: existing, replayed: true };
}
