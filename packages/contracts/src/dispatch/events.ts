import { z } from 'zod';

/** Event types emitted by the dispatch context (outbox). */
export const DISPATCH_EVENTS = {
  offerSent: 'dispatch.offer.sent',
  offerAccepted: 'dispatch.offer.accepted',
  offerDeclined: 'dispatch.offer.declined',
  orderUnassigned: 'dispatch.order.unassigned',
  orderManuallyAssigned: 'dispatch.order.manually_assigned',
} as const;

/** Payload of `dispatch.offer.sent`. */
export const OfferSentPayloadSchema = z.object({
  offerId: z.uuid(),
  orderId: z.uuid(),
  riderId: z.uuid(),
  attempt: z.number().int().positive(),
  radiusM: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
});
/** Payload of `dispatch.offer.sent`. */
export type OfferSentPayload = z.infer<typeof OfferSentPayloadSchema>;

/** Payload of `dispatch.offer.accepted`. */
export const OfferAcceptedPayloadSchema = z.object({
  offerId: z.uuid(),
  orderId: z.uuid(),
  riderId: z.uuid(),
  tripId: z.uuid(),
});
/** Payload of `dispatch.offer.accepted`. */
export type OfferAcceptedPayload = z.infer<typeof OfferAcceptedPayloadSchema>;

/** Payload of `dispatch.offer.declined` (`reason` = declined by rider or timed out). */
export const OfferDeclinedPayloadSchema = z.object({
  offerId: z.uuid(),
  orderId: z.uuid(),
  riderId: z.uuid(),
  reason: z.enum(['declined', 'expired']),
});
/** Payload of `dispatch.offer.declined`. */
export type OfferDeclinedPayload = z.infer<typeof OfferDeclinedPayloadSchema>;

/** Payload of `dispatch.order.unassigned` (ops must dispatch manually). */
export const OrderUnassignedPayloadSchema = z.object({
  orderId: z.uuid(),
  attempts: z.number().int().nonnegative(),
  maxRadiusM: z.number().int().positive(),
  reason: z.enum(['no_candidates', 'max_offers_reached']),
});
/** Payload of `dispatch.order.unassigned`. */
export type OrderUnassignedPayload = z.infer<typeof OrderUnassignedPayloadSchema>;

/** Payload of `dispatch.order.manually_assigned` (ops override; reason kept for audit). */
export const OrderManuallyAssignedPayloadSchema = z.object({
  orderId: z.uuid(),
  riderId: z.uuid(),
  tripId: z.uuid(),
  assignedBy: z.uuid(),
  reason: z.string(),
});
/** Payload of `dispatch.order.manually_assigned`. */
export type OrderManuallyAssignedPayload = z.infer<typeof OrderManuallyAssignedPayloadSchema>;

/** BullMQ queue used by dispatch (delayed start, offer timeouts, next-candidate rounds). */
export const DISPATCH_QUEUE = 'dispatch';
