import type {
  MoneyDto,
  Order,
  OrderPage,
  OrderSummary,
  PaymentIntentStatus,
} from '@delyva/contracts';
import { orderRef } from '../domain/order-money.js';
import { OrderingError } from '../domain/ordering-errors.js';
import type {
  OrderCodes,
  OrderItemRecord,
  OrderListRow,
  OrderRecord,
  PageCursor,
  StatusHistoryRecord,
} from './ports.js';

/** Who is looking: decides which codes are revealed. */
export type OrderAudience = 'customer' | 'vendor' | 'ops';

/** NGN money on the wire. */
export const ngn = (amountMinor: number): MoneyDto => ({ amountMinor, currency: 'NGN' });

/**
 * Intent status as implied by the order lifecycle (orders leave PENDING_PAYMENT only on a
 * verified `payments.intent.*` event, so this never contradicts payments).
 */
function intentStatus(o: OrderRecord): PaymentIntentStatus | null {
  if (!o.paymentIntentId) return null;
  if (o.status === 'PENDING_PAYMENT') return 'requires_action';
  if (o.status === 'PAYMENT_FAILED') return 'failed';
  return 'succeeded';
}

function itemDto(i: OrderItemRecord): Order['items'][number] {
  const unit = i.options.reduce((s, o) => s + o.priceDeltaMinor, i.unitPriceMinor);
  return {
    itemId: i.itemId,
    name: i.name,
    quantity: i.quantity,
    options: i.options.map((o) => ({ id: o.id, name: o.name, priceDelta: ngn(o.priceDeltaMinor) })),
    unitPrice: ngn(unit),
    lineTotal: ngn(unit * i.quantity),
  };
}

/** Full order view for one audience. */
export function toOrderDto(
  o: OrderRecord,
  items: readonly OrderItemRecord[],
  history: readonly StatusHistoryRecord[],
  audience: OrderAudience,
  codes: OrderCodes,
): Order {
  const t = o.totals;
  return {
    id: o.id,
    ref: orderRef(o.id),
    status: o.status,
    vendorId: o.vendorId,
    vendorName: o.vendorName,
    branchId: o.branchId,
    items: items.map(itemDto),
    totals: {
      itemsSubtotal: ngn(t.itemsSubtotal),
      deliveryFee: ngn(t.deliveryFee),
      surgeFee: ngn(t.surgeFee),
      smallOrderFee: ngn(t.smallOrderFee),
      serviceFee: ngn(t.serviceFee),
      discount: ngn(t.discount),
      vat: ngn(t.vat),
      total: ngn(t.total),
    },
    payment: {
      method: o.paymentMethod,
      intentId: o.paymentIntentId,
      intentStatus: intentStatus(o),
      authorizationUrl: o.status === 'PENDING_PAYMENT' ? o.paymentAuthorizationUrl : null,
    },
    promoCode: o.promoCode,
    prepMinutes: o.prepMinutes,
    readyAt: o.readyAt?.toISOString() ?? null,
    etaMinutes: o.etaMinutes,
    rider: o.riderId ? { id: o.riderId } : null,
    deliveryOtp: audience === 'customer' ? codes.deliveryOtp(o.id) : null,
    pickupCode: audience === 'customer' ? null : codes.pickupCode(o.id),
    timeline: history.map((h) => ({
      status: h.status,
      at: h.at.toISOString(),
      actorType: h.actorType,
      reason: h.reason,
    })),
    createdAt: o.createdAt.toISOString(),
  };
}

/** Compact list row. */
export function toSummary(row: OrderListRow): OrderSummary {
  const o = row.order;
  return {
    id: o.id,
    ref: orderRef(o.id),
    status: o.status,
    vendorId: o.vendorId,
    vendorName: o.vendorName,
    branchId: o.branchId,
    customerId: o.customerId,
    total: ngn(o.totals.total),
    itemCount: row.itemCount,
    createdAt: o.createdAt.toISOString(),
  };
}

/** Opaque keyset cursor. */
export function encodeCursor(c: PageCursor): string {
  return Buffer.from(`${c.createdAt.toISOString()}|${c.id}`).toString('base64url');
}

/** @throws OrderingError validation_failed on a malformed cursor */
export function decodeCursor(cursor: string | undefined): PageCursor | null {
  if (cursor === undefined) return null;
  const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(at ?? '');
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new OrderingError('validation_failed', 'Invalid cursor.');
  }
  return { createdAt, id };
}

/** Builds a page from `limit + 1` fetched rows. */
export function toPage(rows: readonly OrderListRow[], limit: number): OrderPage {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    rows.length > limit && last
      ? encodeCursor({ createdAt: last.order.createdAt, id: last.order.id })
      : null;
  return { items: page.map(toSummary), nextCursor };
}
