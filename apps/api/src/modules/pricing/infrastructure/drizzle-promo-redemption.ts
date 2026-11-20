import { PROMO_REDEEMED_EVENT, type PromoRedeemedPayload } from '@delyva/contracts';
import { and, count, eq, sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import { appendToOutbox } from '../../../shared/outbox/outbox.writer.js';
import type {
  LockedPromoScope,
  PromoRedemptionUnitOfWork,
  PromoUsageReader,
  RedemptionRecord,
} from '../application/ports.js';
import { promoRedemptions, promos } from './pricing.schema.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Queryable = Db | Tx;

/**
 * Promo usage facts from `promo_redemptions`.
 * DEBT(pricing): "new customer" = no prior promo redemption — ordering context does not exist yet — switch to ordering's delivered-order count via its public service.
 */
export class DrizzlePromoUsageReader implements PromoUsageReader {
  /** @param db drizzle handle or transaction */
  constructor(private readonly db: Queryable) {}

  /** @inheritdoc */
  async userRedemptionCount(promoId: string, userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(promoRedemptions)
      .where(and(eq(promoRedemptions.promoId, promoId), eq(promoRedemptions.userId, userId)));
    return row?.n ?? 0;
  }

  /** @inheritdoc */
  async isNewCustomer(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ n: count() })
      .from(promoRedemptions)
      .where(eq(promoRedemptions.userId, userId));
    return (row?.n ?? 0) === 0;
  }
}

async function record(tx: Tx, code: string, r: RedemptionRecord): Promise<void> {
  await tx.insert(promoRedemptions).values(r);
  await tx
    .update(promos)
    .set({
      redemptionCount: sql`${promos.redemptionCount} + 1`,
      spentMinor: sql`${promos.spentMinor} + ${r.discountMinor}`,
      updatedAt: new Date(),
    })
    .where(eq(promos.id, r.promoId));
  await appendToOutbox<PromoRedeemedPayload>(tx, {
    type: PROMO_REDEEMED_EVENT,
    aggregateType: 'promo',
    aggregateId: r.promoId,
    payload: {
      redemptionId: r.id,
      promoId: r.promoId,
      code,
      userId: r.userId,
      orderId: r.orderId,
      discountMinor: r.discountMinor,
    },
  });
}

/**
 * Transactional redemption: `SELECT … FOR UPDATE` on the promo row serialises concurrent redeemers.
 * Built on a caller's transaction (ordering checkout) it runs in a SAVEPOINT of that transaction,
 * so the redemption commits or rolls back together with the order.
 */
export class DrizzlePromoRedemptionUnitOfWork implements PromoRedemptionUnitOfWork {
  /** @param db drizzle handle or an enclosing transaction */
  constructor(private readonly db: Queryable) {}

  /** @inheritdoc */
  withLockedPromo<T>(
    code: string,
    work: (scope: LockedPromoScope) => Promise<T>,
  ): Promise<T | null> {
    return this.db.transaction(async (tx) => {
      const [promo] = await tx.select().from(promos).where(eq(promos.code, code)).for('update');
      if (!promo) return null;
      const usage = new DrizzlePromoUsageReader(tx);
      const scope: LockedPromoScope = {
        promo,
        userRedemptionCount: (promoId, userId) => usage.userRedemptionCount(promoId, userId),
        isNewCustomer: (userId) => usage.isNewCustomer(userId),
        redemptionForOrder: async (orderId) => {
          const [row] = await tx
            .select({
              id: promoRedemptions.id,
              promoId: promoRedemptions.promoId,
              userId: promoRedemptions.userId,
              orderId: promoRedemptions.orderId,
              discountMinor: promoRedemptions.discountMinor,
            })
            .from(promoRedemptions)
            .where(
              and(eq(promoRedemptions.promoId, promo.id), eq(promoRedemptions.orderId, orderId)),
            );
          return row ?? null;
        },
        record: (r) => record(tx, promo.code, r),
      };
      return work(scope);
    });
  }
}
