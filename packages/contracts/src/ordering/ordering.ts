import { z } from 'zod';
import { OrderStatusSchema } from '../order-status.js';
import { MoneyDtoSchema, PaymentIntentStatusSchema, PaymentMethodSchema } from '../payments/payments.js';

/** Most units of one item per cart line. */
export const MAX_LINE_QUANTITY = 50;
/** Most lines per cart. */
export const MAX_CART_LINES = 30;

const optionIds = z.array(z.uuid()).max(30);

/** POST /v1/carts/lines body. Prices are never accepted from the client. */
export const AddCartLineSchema = z.strictObject({
  branchId: z.uuid(),
  itemId: z.uuid(),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
  optionIds: optionIds.default([]),
});
/** POST /v1/carts/lines body. */
export type AddCartLine = z.input<typeof AddCartLineSchema>;

/** PATCH /v1/carts/{cartId}/lines/{lineId} body (at least one field). */
export const UpdateCartLineSchema = z
  .strictObject({
    quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).optional(),
    optionIds: optionIds.optional(),
  })
  .refine((v) => v.quantity !== undefined || v.optionIds !== undefined, 'Nothing to update');
/** PATCH cart line body. */
export type UpdateCartLine = z.infer<typeof UpdateCartLineSchema>;

/** A selected modifier option, priced from the catalog. */
export const PricedOptionSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  priceDelta: MoneyDtoSchema,
});
/** A selected modifier option. */
export type PricedOption = z.infer<typeof PricedOptionSchema>;

/** One cart line with live catalog prices. `problem` is set when it cannot be ordered now. */
export const CartLineSchema = z.strictObject({
  id: z.uuid(),
  itemId: z.uuid(),
  name: z.string(),
  quantity: z.number().int().positive(),
  options: z.array(PricedOptionSchema),
  unitPrice: MoneyDtoSchema,
  lineTotal: MoneyDtoSchema,
  problem: z.string().nullable(),
});
/** One cart line. */
export type CartLine = z.infer<typeof CartLineSchema>;

/** A server-side cart (one per user per vendor branch). `version` grows on every change. */
export const CartSchema = z.strictObject({
  id: z.uuid(),
  vendorId: z.uuid(),
  branchId: z.uuid(),
  version: z.number().int().nonnegative(),
  lines: z.array(CartLineSchema),
  itemsSubtotal: MoneyDtoSchema,
  checkoutReady: z.boolean(),
  updatedAt: z.iso.datetime(),
});
/** A server-side cart. */
export type Cart = z.infer<typeof CartSchema>;

/** GET /v1/carts response. */
export const CartListSchema = z.strictObject({ items: z.array(CartSchema) });
/** GET /v1/carts response. */
export type CartList = z.infer<typeof CartListSchema>;

/** POST /v1/orders body (Idempotency-Key required). Totals are always recomputed server-side. */
export const CheckoutRequestSchema = z.strictObject({
  cartId: z.uuid(),
  addressId: z.uuid(),
  paymentMethod: PaymentMethodSchema,
  promoCode: z.string().trim().min(2).max(32).optional(),
});
/** POST /v1/orders body. */
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

/** Who caused a transition. */
export const OrderActorTypeSchema = z.enum(['customer', 'vendor', 'rider', 'ops', 'system']);
/** Who caused a transition. */
export type OrderActorType = z.infer<typeof OrderActorTypeSchema>;

/** One timeline entry (status history is append-only). */
export const OrderTimelineEntrySchema = z.strictObject({
  status: OrderStatusSchema,
  at: z.iso.datetime(),
  actorType: OrderActorTypeSchema,
  reason: z.string().nullable(),
});
/** One timeline entry. */
export type OrderTimelineEntry = z.infer<typeof OrderTimelineEntrySchema>;

/** Ordered line, frozen at checkout. */
export const OrderItemSchema = z.strictObject({
  itemId: z.uuid(),
  name: z.string(),
  quantity: z.number().int().positive(),
  options: z.array(PricedOptionSchema),
  unitPrice: MoneyDtoSchema,
  lineTotal: MoneyDtoSchema,
});
/** Ordered line. */
export type OrderItem = z.infer<typeof OrderItemSchema>;

/** Server-computed totals (kobo). `total = itemsSubtotal + fees + vat − discount`. */
export const OrderTotalsSchema = z.strictObject({
  itemsSubtotal: MoneyDtoSchema,
  deliveryFee: MoneyDtoSchema,
  surgeFee: MoneyDtoSchema,
  smallOrderFee: MoneyDtoSchema,
  serviceFee: MoneyDtoSchema,
  discount: MoneyDtoSchema,
  vat: MoneyDtoSchema,
  total: MoneyDtoSchema,
});
/** Order totals. */
export type OrderTotals = z.infer<typeof OrderTotalsSchema>;

/** Payment summary of an order. */
export const OrderPaymentSchema = z.strictObject({
  method: PaymentMethodSchema,
  intentId: z.uuid().nullable(),
  intentStatus: PaymentIntentStatusSchema.nullable(),
  authorizationUrl: z.url().nullable(),
});
/** Payment summary. */
export type OrderPayment = z.infer<typeof OrderPaymentSchema>;

/** An order as seen by its customer, vendor or ops. Codes appear only for the right audience. */
export const OrderSchema = z.strictObject({
  id: z.uuid(),
  ref: z.string(),
  status: OrderStatusSchema,
  vendorId: z.uuid(),
  vendorName: z.string(),
  branchId: z.uuid(),
  items: z.array(OrderItemSchema),
  totals: OrderTotalsSchema,
  payment: OrderPaymentSchema,
  promoCode: z.string().nullable(),
  prepMinutes: z.number().int().nullable(),
  readyAt: z.iso.datetime().nullable(),
  etaMinutes: z.number().int().nonnegative(),
  rider: z.strictObject({ id: z.uuid() }).nullable(),
  deliveryOtp: z.string().regex(/^\d{4}$/).nullable().describe('customer only'),
  pickupCode: z.string().regex(/^\d{4}$/).nullable().describe('vendor and ops only'),
  timeline: z.array(OrderTimelineEntrySchema),
  createdAt: z.iso.datetime(),
});
/** An order. */
export type Order = z.infer<typeof OrderSchema>;

/** Compact order row for lists. */
export const OrderSummarySchema = z.strictObject({
  id: z.uuid(),
  ref: z.string(),
  status: OrderStatusSchema,
  vendorId: z.uuid(),
  vendorName: z.string(),
  branchId: z.uuid(),
  customerId: z.uuid(),
  total: MoneyDtoSchema,
  itemCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
/** Compact order row. */
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

/** Cursor page of orders, newest first. */
export const OrderPageSchema = z.strictObject({
  items: z.array(OrderSummarySchema),
  nextCursor: z.string().nullable(),
});
/** Cursor page of orders. */
export type OrderPage = z.infer<typeof OrderPageSchema>;

const limit = z.coerce.number().int().min(1).max(50).default(20);
const cursor = z.string().min(1).max(200).optional();

/** GET /v1/orders query. */
export const ListMyOrdersQuerySchema = z.strictObject({ limit, cursor });
/** GET /v1/orders query. */
export type ListMyOrdersQuery = z.input<typeof ListMyOrdersQuerySchema>;

/** GET /v1/vendors/{vendorId}/orders query. */
export const ListVendorOrdersQuerySchema = z.strictObject({
  status: OrderStatusSchema.optional(),
  limit,
  cursor,
});
/** GET vendor orders query. */
export type ListVendorOrdersQuery = z.input<typeof ListVendorOrdersQuerySchema>;

/** GET /v1/admin/orders query. */
export const ListAdminOrdersQuerySchema = z.strictObject({
  status: OrderStatusSchema.optional(),
  vendorId: z.uuid().optional(),
  customerId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit,
  cursor,
});
/** GET admin orders query. */
export type ListAdminOrdersQuery = z.input<typeof ListAdminOrdersQuerySchema>;

const reason = z.string().trim().min(3).max(300);

/** POST /v1/vendor-orders/{id}/accept body. */
export const AcceptOrderSchema = z.strictObject({
  prepMinutes: z.number().int().min(1).max(180),
});
/** Accept body. */
export type AcceptOrder = z.infer<typeof AcceptOrderSchema>;

/** POST /v1/vendor-orders/{id}/reject body. */
export const RejectOrderSchema = z.strictObject({ reason });
/** Reject body. */
export type RejectOrder = z.infer<typeof RejectOrderSchema>;

/** POST /v1/orders/{id}/cancel body (customer; reason optional). */
export const CancelOrderSchema = z.strictObject({ reason: reason.optional() });
/** Customer cancel body. */
export type CancelOrder = z.infer<typeof CancelOrderSchema>;

/** POST /v1/admin/orders/{id}/cancel body (reason required, audited). */
export const AdminCancelOrderSchema = z.strictObject({ reason });
/** Ops cancel body. */
export type AdminCancelOrder = z.infer<typeof AdminCancelOrderSchema>;
