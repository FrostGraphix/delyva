import type { DbTx } from '../../../shared/database/database.js';
import type { Clock } from '../application/ports.js';
import {
  RedeemPromo,
  type RedeemPromoCommand,
  type RedeemPromoResult,
} from '../application/redeem-promo.use-case.js';
import { DrizzlePromoRedemptionUnitOfWork } from './drizzle-promo-redemption.js';

/**
 * Public pricing service for ordering: runs {@link RedeemPromo} inside the caller's transaction
 * (a SAVEPOINT), so an order and its promo redemption are committed atomically.
 */
export class TransactionalRedeemPromo {
  /** @param clock clock and id source */
  constructor(private readonly clock: Clock) {}

  /** Redeems within `tx`. @throws PricingError not_found | promo_ineligible | conflict */
  execute(tx: DbTx, cmd: RedeemPromoCommand): Promise<RedeemPromoResult> {
    const uow = new DrizzlePromoRedemptionUnitOfWork(tx);
    return new RedeemPromo({ uow, clock: this.clock }).execute(cmd);
  }
}
