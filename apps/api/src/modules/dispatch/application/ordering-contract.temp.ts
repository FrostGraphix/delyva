// TEMP(ordering-contract): local copy of the ordering context's public contract, coded to the
// agreed parallel spec because ordering is not on main yet. After the ordering merge, delete this
// file and import `OrderFulfilmentPort` and the `ordering.order.vendor_accepted` payload schema
// from `@delyva/contracts` (packages/contracts/src/ordering/), and bind ORDER_FULFILMENT_PORT to
// ordering's real implementation in DispatchModule.
import { z } from 'zod';

/** Event type ordering emits (outbox) when the vendor accepts an order. */
export const VENDOR_ACCEPTED_EVENT = 'ordering.order.vendor_accepted';

const Point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

/** TEMP(ordering-contract): payload of `ordering.order.vendor_accepted`. */
export const VendorAcceptedPayloadSchema = z.object({
  orderId: z.uuid(),
  branchId: z.uuid(),
  pickup: Point,
  dropoff: Point,
  prepMinutes: z.number().int().nonnegative(),
  readyAt: z.iso.datetime(),
});
/** TEMP(ordering-contract): payload of `ordering.order.vendor_accepted`. */
export type VendorAcceptedPayload = z.infer<typeof VendorAcceptedPayloadSchema>;

/**
 * TEMP(ordering-contract): commands dispatch sends to ordering's order state machine.
 * Implementations reject invalid transitions and wrong codes by throwing coded errors.
 */
export interface OrderFulfilmentPort {
  /** READY/PREPARING → RIDER_ASSIGNED. */
  markRiderAssigned(orderId: string, riderId: string): Promise<void>;
  /** → RIDER_AT_VENDOR; ordering verifies the vendor's pickup code. */
  markRiderAtVendor(orderId: string, riderId: string, pickupCode: string): Promise<void>;
  /** → PICKED_UP. */
  markPickedUp(orderId: string, riderId: string): Promise<void>;
  /** → RIDER_AT_CUSTOMER. */
  markRiderAtCustomer(orderId: string, riderId: string): Promise<void>;
  /** → DELIVERED; ordering verifies the customer's delivery OTP. */
  markDelivered(orderId: string, riderId: string, deliveryOtp: string): Promise<void>;
  /** → UNDELIVERABLE (refund path). */
  markUndeliverable(orderId: string, riderId: string, reason: string): Promise<void>;
}

/** DI token for {@link OrderFulfilmentPort}. */
export const ORDER_FULFILMENT_PORT = Symbol('ORDER_FULFILMENT_PORT');
