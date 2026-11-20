import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const money = (name: string) => bigint(name, { mode: 'number' }).notNull();
const ts = (name: string) => timestamp(name, { withTimezone: true });

/** Server-side carts: one per user per vendor branch. Prices are never stored. */
export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('carts_user_branch_uq').on(t.userId, t.branchId),
    index('carts_user_idx').on(t.userId, t.updatedAt),
  ],
);

/** Cart lines: item + chosen modifier option ids + quantity. */
export const cartLines = pgTable(
  'cart_lines',
  {
    id: uuid('id').primaryKey(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').notNull(),
    optionIds: jsonb('option_ids').$type<string[]>().notNull(),
    quantity: smallint('quantity').notNull(),
    position: smallint('position').notNull(),
  },
  (t) => [
    index('cart_lines_cart_idx').on(t.cartId, t.position),
    check('cart_lines_qty_chk', sql`${t.quantity} BETWEEN 1 AND 50`),
  ],
);

/** Orders. Totals in kobo frozen at checkout; codes stored only as hashes. */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey(),
    customerId: uuid('customer_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    vendorName: text('vendor_name').notNull(),
    branchId: uuid('branch_id').notNull(),
    status: text('status').notNull(),
    paymentMethod: text('payment_method').notNull(),
    paymentIntentId: uuid('payment_intent_id'),
    paymentAuthorizationUrl: text('payment_authorization_url'),
    currency: text('currency').notNull().default('NGN'),
    itemsSubtotalMinor: money('items_subtotal_minor'),
    deliveryFeeMinor: money('delivery_fee_minor'),
    surgeFeeMinor: money('surge_fee_minor'),
    smallOrderFeeMinor: money('small_order_fee_minor'),
    serviceFeeMinor: money('service_fee_minor'),
    discountMinor: money('discount_minor'),
    vatMinor: money('vat_minor'),
    totalMinor: money('total_minor'),
    promoCode: text('promo_code'),
    pickupLat: doublePrecision('pickup_lat').notNull(),
    pickupLng: doublePrecision('pickup_lng').notNull(),
    dropoffLat: doublePrecision('dropoff_lat').notNull(),
    dropoffLng: doublePrecision('dropoff_lng').notNull(),
    prepMinutes: smallint('prep_minutes'),
    readyAt: ts('ready_at'),
    etaMinutes: smallint('eta_minutes').notNull(),
    riderId: uuid('rider_id'),
    deliveryOtpHash: text('delivery_otp_hash').notNull(),
    pickupCodeHash: text('pickup_code_hash').notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_customer_idem_uq').on(t.customerId, t.idempotencyKey),
    index('orders_customer_idx').on(t.customerId, t.createdAt, t.id),
    index('orders_vendor_idx').on(t.vendorId, t.createdAt, t.id),
    index('orders_status_idx').on(t.status, t.createdAt),
    index('orders_rider_idx').on(t.riderId),
    check(
      'orders_total_chk',
      sql`${t.totalMinor} = ${t.itemsSubtotalMinor} + ${t.deliveryFeeMinor} + ${t.surgeFeeMinor} + ${t.smallOrderFeeMinor} + ${t.serviceFeeMinor} + ${t.vatMinor} - ${t.discountMinor} AND ${t.totalMinor} > 0`,
    ),
    check('orders_method_chk', sql`${t.paymentMethod} IN ('card','transfer','wallet')`),
  ],
);

/** Ordered lines frozen at checkout. */
export const orderItems = pgTable(
  'order_items',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    itemId: uuid('item_id').notNull(),
    name: text('name').notNull(),
    quantity: smallint('quantity').notNull(),
    unitPriceMinor: money('unit_price_minor'),
    options: jsonb('options').$type<{ id: string; name: string; priceDeltaMinor: number }[]>().notNull(),
    position: smallint('position').notNull(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId, t.position)],
);

/** Append-only status history (actor, time, reason per transition). */
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    status: text('status').notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    reason: text('reason'),
    at: ts('at').notNull(),
  },
  (t) => [index('order_status_history_order_idx').on(t.orderId, t.id)],
);

/** Claims of consumed outbox events (payments.intent.*), one row per event. */
export const orderingEventReceipts = pgTable('ordering_event_receipts', {
  eventId: uuid('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  outcome: text('outcome').notNull(),
  processedAt: ts('processed_at').notNull().defaultNow(),
});
