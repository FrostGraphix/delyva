import type { OrderStatus } from '../order-status.js';

/** Result of a rider-side transition. */
export interface OrderFulfilmentResult {
  readonly orderId: string;
  /** Status after the call (unchanged when the call was an idempotent replay). */
  readonly status: OrderStatus;
}

/**
 * Port the dispatch context calls for rider-side order transitions. Implemented by ordering and
 * provided under {@link ORDER_FULFILMENT_PORT}. Every method checks ownership: only the rider
 * assigned to the order may move it (others get `forbidden`; unknown orders `not_found`).
 * Invalid transitions fail with `conflict`. Replays of the transition that already happened
 * return the current status instead of failing (offline rider queues retry).
 *
 * - `markRiderAssigned` may be called once the vendor has accepted (assignment runs in parallel
 *   with PREPARING). The status moves to RIDER_ASSIGNED once the order is READY_FOR_PICKUP.
 * - `markRiderAtVendor` requires READY_FOR_PICKUP/RIDER_ASSIGNED and the order's 4-digit pickup
 *   code (shown to the vendor).
 * - `markDelivered` requires the customer's 4-digit delivery OTP and captures the payment split.
 * - `markUndeliverable` (from PICKED_UP or RIDER_AT_CUSTOMER) refunds/releases the customer.
 */
export interface OrderFulfilmentPort {
  /** Binds the rider to the order (VENDOR_ACCEPTED / PREPARING / READY_FOR_PICKUP). */
  markRiderAssigned(orderId: string, riderId: string): Promise<OrderFulfilmentResult>;
  /** RIDER_ASSIGNED → RIDER_AT_VENDOR, verifying the pickup code. */
  markRiderAtVendor(
    orderId: string,
    riderId: string,
    pickupCode: string,
  ): Promise<OrderFulfilmentResult>;
  /** RIDER_AT_VENDOR → PICKED_UP. */
  markPickedUp(orderId: string, riderId: string): Promise<OrderFulfilmentResult>;
  /** PICKED_UP → RIDER_AT_CUSTOMER. */
  markRiderAtCustomer(orderId: string, riderId: string): Promise<OrderFulfilmentResult>;
  /** RIDER_AT_CUSTOMER → DELIVERED, verifying the delivery OTP. */
  markDelivered(
    orderId: string,
    riderId: string,
    deliveryOtp: string,
  ): Promise<OrderFulfilmentResult>;
  /** PICKED_UP | RIDER_AT_CUSTOMER → UNDELIVERABLE → REFUND_PENDING → REFUNDED. */
  markUndeliverable(
    orderId: string,
    riderId: string,
    reason: string,
  ): Promise<OrderFulfilmentResult>;
}

/** Nest DI token (string, so dispatch needs no import from apps/api) for {@link OrderFulfilmentPort}. */
export const ORDER_FULFILMENT_PORT = 'ordering.OrderFulfilmentPort';
