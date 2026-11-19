import { z } from 'zod';

/** Every order state from the ARCHITECTURE order state machine, in happy-path order first. */
export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PLACED',
  'VENDOR_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'RIDER_ASSIGNED',
  'RIDER_AT_VENDOR',
  'PICKED_UP',
  'RIDER_AT_CUSTOMER',
  'DELIVERED',
  'PAYMENT_FAILED',
  'VENDOR_REJECTED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_OPS',
  'UNDELIVERABLE',
  'REFUND_PENDING',
  'REFUNDED',
] as const;

/** Zod enum for order status. */
export const OrderStatusSchema = z.enum(ORDER_STATUSES);

/** Order lifecycle status. */
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/** Enum-like accessor, e.g. `OrderStatus.PLACED`. */
export const OrderStatus = OrderStatusSchema.enum;

/** The main (happy) path, used e.g. by the 5-step tracking bar. */
export const ORDER_HAPPY_PATH: readonly OrderStatus[] = ORDER_STATUSES.slice(0, 10);

/** Terminal states: no transition leaves them. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'DELIVERED',
  'PAYMENT_FAILED',
  'REFUNDED',
];
