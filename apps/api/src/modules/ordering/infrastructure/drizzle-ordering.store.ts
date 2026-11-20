import type { OrderActorType, OrderStatus, PaymentMethod } from '@delyva/contracts';
import { and, asc, count, desc, eq, gte, inArray, lt, or, type SQL } from 'drizzle-orm';
import type { Db, DbTx } from '../../../shared/database/database.js';
import { appendToOutbox } from '../../../shared/outbox/outbox.writer.js';
import type {
  CartState,
  CartStore,
  OrderFilter,
  OrderItemRecord,
  OrderListRow,
  OrderPatch,
  OrderRecord,
  OrderStore,
  OrderTx,
  PageCursor,
  PromoRedemption,
  StatusHistoryRecord,
} from '../application/ports.js';
import { cartLines, carts, orderItems, orders, orderStatusHistory } from './ordering.schema.js';

type Row = typeof orders.$inferSelect;
type Q = Db | DbTx;

/** Redeems a promo inside an enclosing transaction (pricing's TransactionalRedeemPromo). */
export type TxPromoRedeemer = (tx: DbTx, cmd: PromoRedemption) => Promise<unknown>;

function toRecord(r: Row): OrderRecord {
  return {
    id: r.id,
    customerId: r.customerId,
    vendorId: r.vendorId,
    vendorName: r.vendorName,
    branchId: r.branchId,
    status: r.status as OrderStatus,
    paymentMethod: r.paymentMethod as PaymentMethod,
    paymentIntentId: r.paymentIntentId,
    paymentAuthorizationUrl: r.paymentAuthorizationUrl,
    totals: {
      itemsSubtotal: r.itemsSubtotalMinor,
      deliveryFee: r.deliveryFeeMinor,
      surgeFee: r.surgeFeeMinor,
      smallOrderFee: r.smallOrderFeeMinor,
      serviceFee: r.serviceFeeMinor,
      discount: r.discountMinor,
      vat: r.vatMinor,
      total: r.totalMinor,
    },
    promoCode: r.promoCode,
    pickup: { lat: r.pickupLat, lng: r.pickupLng },
    dropoff: { lat: r.dropoffLat, lng: r.dropoffLng },
    prepMinutes: r.prepMinutes,
    readyAt: r.readyAt,
    etaMinutes: r.etaMinutes,
    riderId: r.riderId,
    deliveryOtpHash: r.deliveryOtpHash,
    pickupCodeHash: r.pickupCodeHash,
    idempotencyKey: r.idempotencyKey,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toRow(o: OrderRecord): typeof orders.$inferInsert {
  const t = o.totals;
  return {
    id: o.id,
    customerId: o.customerId,
    vendorId: o.vendorId,
    vendorName: o.vendorName,
    branchId: o.branchId,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentIntentId: o.paymentIntentId,
    paymentAuthorizationUrl: o.paymentAuthorizationUrl,
    itemsSubtotalMinor: t.itemsSubtotal,
    deliveryFeeMinor: t.deliveryFee,
    surgeFeeMinor: t.surgeFee,
    smallOrderFeeMinor: t.smallOrderFee,
    serviceFeeMinor: t.serviceFee,
    discountMinor: t.discount,
    vatMinor: t.vat,
    totalMinor: t.total,
    promoCode: o.promoCode,
    pickupLat: o.pickup.lat,
    pickupLng: o.pickup.lng,
    dropoffLat: o.dropoff.lat,
    dropoffLng: o.dropoff.lng,
    prepMinutes: o.prepMinutes,
    readyAt: o.readyAt,
    etaMinutes: o.etaMinutes,
    riderId: o.riderId,
    deliveryOtpHash: o.deliveryOtpHash,
    pickupCodeHash: o.pickupCodeHash,
    idempotencyKey: o.idempotencyKey,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

function txOps(tx: DbTx, redeem: TxPromoRedeemer): OrderTx {
  return {
    async insertOrder(order, items) {
      await tx.insert(orders).values(toRow(order));
      if (items.length === 0) return;
      await tx.insert(orderItems).values(
        items.map((i, position) => ({
          orderId: order.id,
          itemId: i.itemId,
          name: i.name,
          quantity: i.quantity,
          unitPriceMinor: i.unitPriceMinor,
          options: [...i.options],
          position,
        })),
      );
    },
    async lockOrder(orderId) {
      const [r] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      return r ? toRecord(r) : null;
    },
    async updateOrder(orderId, patch: OrderPatch, at) {
      await tx
        .update(orders)
        .set({ ...patch, updatedAt: at })
        .where(eq(orders.id, orderId));
    },
    async appendHistory(orderId, e: StatusHistoryRecord) {
      await tx.insert(orderStatusHistory).values({ orderId, ...e });
    },
    async appendEvent(event) {
      await appendToOutbox(tx, { ...event, aggregateType: 'order' });
    },
    async redeemPromo(cmd) {
      await redeem(tx, cmd);
    },
    async deleteCart(userId, cartId) {
      await tx.delete(carts).where(and(eq(carts.id, cartId), eq(carts.userId, userId)));
    },
  };
}

function filterSql(f: OrderFilter, after: PageCursor | null): SQL | undefined {
  return and(
    f.customerId ? eq(orders.customerId, f.customerId) : undefined,
    f.vendorId ? eq(orders.vendorId, f.vendorId) : undefined,
    f.status ? eq(orders.status, f.status) : undefined,
    f.from ? gte(orders.createdAt, f.from) : undefined,
    f.to ? lt(orders.createdAt, f.to) : undefined,
    after
      ? or(
          lt(orders.createdAt, after.createdAt),
          and(eq(orders.createdAt, after.createdAt), lt(orders.id, after.id)),
        )
      : undefined,
  );
}

/** Drizzle adapter for {@link OrderStore}. */
export class DrizzleOrderStore implements OrderStore {
  /** @param db drizzle db @param redeem in-transaction promo redeemer */
  constructor(
    private readonly db: Db,
    private readonly redeem: TxPromoRedeemer,
  ) {}

  /** @inheritdoc */
  transaction<T>(work: (tx: OrderTx) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(txOps(tx, this.redeem)));
  }

  /** @inheritdoc */
  async findById(orderId: string): Promise<OrderRecord | null> {
    const [r] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    return r ? toRecord(r) : null;
  }

  /** @inheritdoc */
  async findByIdempotencyKey(customerId: string, key: string): Promise<OrderRecord | null> {
    const [r] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.customerId, customerId), eq(orders.idempotencyKey, key)));
    return r ? toRecord(r) : null;
  }

  /** @inheritdoc */
  async items(orderId: string): Promise<OrderItemRecord[]> {
    const rows = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.position));
    return rows.map((r) => ({
      itemId: r.itemId,
      name: r.name,
      quantity: r.quantity,
      unitPriceMinor: r.unitPriceMinor,
      options: r.options,
    }));
  }

  /** @inheritdoc */
  async history(orderId: string): Promise<StatusHistoryRecord[]> {
    const rows = await this.db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(asc(orderStatusHistory.id));
    return rows.map((r) => ({
      status: r.status as OrderStatus,
      at: r.at,
      actorType: r.actorType as OrderActorType,
      actorId: r.actorId,
      reason: r.reason,
    }));
  }

  /** @inheritdoc */
  async list(
    filter: OrderFilter,
    limit: number,
    after: PageCursor | null,
  ): Promise<OrderListRow[]> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(filterSql(filter, after))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit);
    if (rows.length === 0) return [];
    const counts = await this.db
      .select({ orderId: orderItems.orderId, n: count() })
      .from(orderItems)
      .where(
        inArray(
          orderItems.orderId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(orderItems.orderId);
    const byId = new Map(counts.map((c) => [c.orderId, c.n]));
    return rows.map((r) => ({ order: toRecord(r), itemCount: byId.get(r.id) ?? 0 }));
  }
}

async function loadCart(db: Q, where: SQL | undefined): Promise<CartState[]> {
  const rows = await db.select().from(carts).where(where).orderBy(desc(carts.updatedAt));
  if (rows.length === 0) return [];
  const lines = await db
    .select()
    .from(cartLines)
    .where(
      inArray(
        cartLines.cartId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(cartLines.position));
  return rows.map((c) => ({
    id: c.id,
    userId: c.userId,
    vendorId: c.vendorId,
    branchId: c.branchId,
    version: c.version,
    updatedAt: c.updatedAt,
    lines: lines
      .filter((l) => l.cartId === c.id)
      .map((l) => ({ id: l.id, itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds })),
  }));
}

/** Drizzle adapter for {@link CartStore}; every query is scoped by owner. */
export class DrizzleCartStore implements CartStore {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async findForUser(userId: string, cartId: string): Promise<CartState | null> {
    const [c] = await loadCart(this.db, and(eq(carts.id, cartId), eq(carts.userId, userId)));
    return c ?? null;
  }

  /** @inheritdoc */
  async findByBranch(userId: string, branchId: string): Promise<CartState | null> {
    const [c] = await loadCart(
      this.db,
      and(eq(carts.branchId, branchId), eq(carts.userId, userId)),
    );
    return c ?? null;
  }

  /** @inheritdoc */
  listForUser(userId: string): Promise<CartState[]> {
    return loadCart(this.db, eq(carts.userId, userId));
  }

  /** @inheritdoc */
  save(cart: CartState, expectedVersion: number | null): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      if (expectedVersion === null) {
        const inserted = await tx
          .insert(carts)
          .values({
            id: cart.id,
            userId: cart.userId,
            vendorId: cart.vendorId,
            branchId: cart.branchId,
            version: cart.version,
            updatedAt: cart.updatedAt,
          })
          .onConflictDoNothing()
          .returning({ id: carts.id });
        if (inserted.length === 0) return false;
      } else {
        const updated = await tx
          .update(carts)
          .set({ version: cart.version, updatedAt: cart.updatedAt })
          .where(
            and(
              eq(carts.id, cart.id),
              eq(carts.userId, cart.userId),
              eq(carts.version, expectedVersion),
            ),
          )
          .returning({ id: carts.id });
        if (updated.length === 0) return false;
        await tx.delete(cartLines).where(eq(cartLines.cartId, cart.id));
      }
      if (cart.lines.length > 0) {
        await tx.insert(cartLines).values(
          cart.lines.map((l, position) => ({
            id: l.id,
            cartId: cart.id,
            itemId: l.itemId,
            optionIds: [...l.optionIds],
            quantity: l.quantity,
            position,
          })),
        );
      }
      return true;
    });
  }

  /** @inheritdoc */
  async delete(userId: string, cartId: string): Promise<boolean> {
    const rows = await this.db
      .delete(carts)
      .where(and(eq(carts.id, cartId), eq(carts.userId, userId)))
      .returning({ id: carts.id });
    return rows.length > 0;
  }
}
