import { z } from 'zod';
import { GeoPointSchema } from '../geo/geo.js';
import { ORDER_STATUSES, type OrderStatus, OrderStatusSchema } from '../order-status.js';
import { OrderActorTypeSchema } from './ordering.js';

/** Event type emitted when an order enters `status`: `ordering.order.<status lower-case>`. */
export function orderEventType(status: OrderStatus): `ordering.order.${Lowercase<OrderStatus>}` {
  return `ordering.order.${status.toLowerCase() as Lowercase<OrderStatus>}`;
}

/** Every event type the ordering context emits (one per state). */
export const ORDERING_EVENT_TYPES: readonly string[] = ORDER_STATUSES.map(orderEventType);

/** Event consumed by dispatch: the vendor accepted, schedule the rider. */
export const ORDER_VENDOR_ACCEPTED_EVENT = orderEventType('VENDOR_ACCEPTED');

/**
 * Payload of every `ordering.order.<state>` event. Carries `customerId` + `orderRef` for
 * notifications; ids only (no PII).
 */
export const OrderStatusChangedPayloadSchema = z.object({
  orderId: z.uuid(),
  orderRef: z.string(),
  customerId: z.uuid(),
  vendorId: z.uuid(),
  branchId: z.uuid(),
  riderId: z.uuid().nullable(),
  status: OrderStatusSchema,
  previousStatus: OrderStatusSchema.nullable(),
  actor: z.object({ type: OrderActorTypeSchema, id: z.string().nullable() }),
  reason: z.string().nullable(),
  at: z.iso.datetime(),
});
/** Payload of `ordering.order.<state>`. */
export type OrderStatusChangedPayload = z.infer<typeof OrderStatusChangedPayloadSchema>;

/**
 * Payload of `ordering.order.vendor_accepted` (consumed by dispatch). Superset of
 * {@link OrderStatusChangedPayloadSchema} with pickup/drop-off points and the prep schedule.
 */
export const OrderVendorAcceptedPayloadSchema = OrderStatusChangedPayloadSchema.extend({
  orderId: z.uuid(),
  branchId: z.uuid(),
  pickup: GeoPointSchema,
  dropoff: GeoPointSchema,
  prepMinutes: z.number().int().positive(),
  readyAt: z.iso.datetime(),
});
/** Payload of `ordering.order.vendor_accepted`. */
export type OrderVendorAcceptedPayload = z.infer<typeof OrderVendorAcceptedPayloadSchema>;

/** BullMQ queue names owned by ordering. */
export const ORDERING_QUEUES = {
  /** Delayed job per PLACED order: auto-reject when the vendor does not respond in time. */
  autoReject: 'ordering-auto-reject',
} as const;

/** Job data of {@link ORDERING_QUEUES.autoReject}. */
export const AutoRejectJobSchema = z.object({ orderId: z.uuid() });
/** Job data of the auto-reject queue. */
export type AutoRejectJob = z.infer<typeof AutoRejectJobSchema>;
