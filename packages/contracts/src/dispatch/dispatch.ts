import { z } from 'zod';
import { RiderLocationSchema } from '../realtime/index.js';

/** Rider availability status. `on_trip` is set by dispatch on assignment, never by the rider. */
export const RiderStatusSchema = z.enum(['offline', 'online', 'on_trip']);
/** Rider availability status. */
export type RiderStatus = z.infer<typeof RiderStatusSchema>;

/** Lagos-style vehicle plate, e.g. `LAG-452-EV`. */
export const VehiclePlateSchema = z
  .string()
  .regex(/^[A-Z]{3}-\d{3}-[A-Z]{2}$/, 'Plate must look like LAG-452-EV');

/** Battery level reported by the rider app (0–100). */
export const BatteryPctSchema = z.number().int().min(0).max(100);

/** POST /v1/riders/me/online and /offline body. */
export const RiderAvailabilityRequestSchema = z.strictObject({ batteryPct: BatteryPctSchema });
/** Availability toggle body. */
export type RiderAvailabilityRequest = z.infer<typeof RiderAvailabilityRequestSchema>;

/** GET /v1/riders/me response (and availability toggles). */
export const RiderProfileSchema = z.strictObject({
  riderId: z.uuid(),
  vehiclePlate: VehiclePlateSchema.nullable(),
  hub: z.string().nullable(),
  batteryPct: BatteryPctSchema.nullable(),
  status: RiderStatusSchema,
  rating: z.number().min(0).max(5),
  stats: z.strictObject({
    offersReceived: z.number().int().nonnegative(),
    offersAccepted: z.number().int().nonnegative(),
    offersDeclined: z.number().int().nonnegative(),
    offersExpired: z.number().int().nonnegative(),
    /** Accepted / received in basis points (0–10000); null before the first offer. */
    acceptanceRateBps: z.number().int().min(0).max(10_000).nullable(),
  }),
  lastJobAt: z.iso.datetime().nullable(),
});
/** Rider profile. */
export type RiderProfile = z.infer<typeof RiderProfileSchema>;

/** Point (WGS84). */
export const DispatchPointSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
/** Point (WGS84). */
export type DispatchPoint = z.infer<typeof DispatchPointSchema>;

/** Offer lifecycle. */
export const DispatchOfferStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'expired',
  'superseded',
]);
/** Offer lifecycle status. */
export type DispatchOfferStatus = z.infer<typeof DispatchOfferStatusSchema>;

/** Job offer shown to one rider (`dispatch:offer` socket event and offer responses). */
export const DispatchOfferSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  status: DispatchOfferStatusSchema,
  pickup: DispatchPointSchema,
  dropoff: DispatchPointSchema,
  distanceToPickupM: z.number().int().nonnegative(),
  pickupEtaSeconds: z.number().int().nonnegative(),
  readyAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
/** Job offer. */
export type DispatchOffer = z.infer<typeof DispatchOfferSchema>;

/** Trip lifecycle (mirrors the rider-facing part of the order state machine). */
export const TripStatusSchema = z.enum([
  'assigned',
  'at_vendor',
  'picked_up',
  'at_customer',
  'delivered',
  'undeliverable',
]);
/** Trip status. */
export type TripStatus = z.infer<typeof TripStatusSchema>;

/** A rider's trip for one order. */
export const TripSchema = z.strictObject({
  id: z.uuid(),
  orderId: z.uuid(),
  riderId: z.uuid(),
  status: TripStatusSchema,
  pickup: DispatchPointSchema,
  dropoff: DispatchPointSchema,
  assignment: z.enum(['offer', 'manual']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
/** Trip. */
export type Trip = z.infer<typeof TripSchema>;

/** GET /v1/riders/me/trips/current response. */
export const CurrentTripSchema = z.strictObject({ trip: TripSchema.nullable() });
/** Current trip (or null). */
export type CurrentTrip = z.infer<typeof CurrentTripSchema>;

/** GET /v1/riders/me/earnings response (placeholder until payments exposes a rider balance read). */
export const RiderEarningsSchema = z.strictObject({
  currency: z.literal('NGN'),
  /** Rider payable balance in kobo; null while the ledger read is not available. */
  balanceMinor: z.number().int().nullable(),
  completedTrips: z.number().int().nonnegative(),
  available: z.boolean(),
});
/** Rider earnings summary. */
export type RiderEarnings = z.infer<typeof RiderEarningsSchema>;

/**
 * Optional device fix captured when the action happened. Used for the GPS sanity check of
 * actions replayed after the rider was offline (the server position may be newer and elsewhere).
 */
const ActionLocation = { location: RiderLocationSchema.optional() };

/** Handoff code (pickup code / delivery OTP): 4–6 digits. */
export const HandoffCodeSchema = z.string().regex(/^\d{4,6}$/, 'Must be 4–6 digits');

/** POST /v1/trips/{id}/arrived-at-vendor body. */
export const ArrivedAtVendorSchema = z.strictObject({
  pickupCode: HandoffCodeSchema,
  ...ActionLocation,
});
/** Arrived-at-vendor body. */
export type ArrivedAtVendor = z.input<typeof ArrivedAtVendorSchema>;

/** POST /v1/trips/{id}/picked-up and /arrived-at-customer body. */
export const TripActionSchema = z.strictObject({ ...ActionLocation });
/** Plain trip action body. */
export type TripAction = z.input<typeof TripActionSchema>;

/** POST /v1/trips/{id}/delivered body. */
export const DeliveredSchema = z.strictObject({
  deliveryOtp: HandoffCodeSchema,
  ...ActionLocation,
});
/** Delivered body. */
export type Delivered = z.input<typeof DeliveredSchema>;

/** POST /v1/trips/{id}/undeliverable body. */
export const UndeliverableSchema = z.strictObject({
  reason: z.string().trim().min(3).max(500),
  ...ActionLocation,
});
/** Undeliverable body. */
export type Undeliverable = z.input<typeof UndeliverableSchema>;

/** One online rider for the ops dispatch map. */
export const AdminDispatchRiderSchema = z.strictObject({
  riderId: z.uuid(),
  status: RiderStatusSchema,
  vehiclePlate: VehiclePlateSchema.nullable(),
  batteryPct: BatteryPctSchema.nullable(),
  position: z.strictObject({ lat: z.number(), lng: z.number(), ts: z.number().int() }).nullable(),
  activeOrderId: z.uuid().nullable(),
});
/** Ops rider row. */
export type AdminDispatchRider = z.infer<typeof AdminDispatchRiderSchema>;

/** GET /v1/admin/dispatch/riders response. */
export const AdminDispatchRiderListSchema = z.strictObject({
  items: z.array(AdminDispatchRiderSchema),
});
/** Ops rider list. */
export type AdminDispatchRiderList = z.infer<typeof AdminDispatchRiderListSchema>;

/** POST /v1/admin/dispatch/orders/{orderId}/assign body. */
export const ManualAssignSchema = z.strictObject({
  riderId: z.uuid(),
  reason: z.string().trim().min(5).max(500),
});
/** Manual assignment body. */
export type ManualAssign = z.infer<typeof ManualAssignSchema>;
