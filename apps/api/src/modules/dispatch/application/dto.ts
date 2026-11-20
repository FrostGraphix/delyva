import type { DispatchOffer, RiderProfile, Trip } from '@delyva/contracts';
import { acceptanceRateBps, type RiderProfileState } from '../domain/rider.js';
import type { DispatchRequest, OfferRecord, TripRecord } from './ports.js';

/** Rider profile → API DTO. */
export function toRiderProfileDto(p: RiderProfileState): RiderProfile {
  return {
    riderId: p.riderId,
    vehiclePlate: p.vehiclePlate,
    hub: p.hub,
    batteryPct: p.batteryPct,
    status: p.status,
    rating: p.ratingX100 / 100,
    stats: {
      offersReceived: p.offersReceived,
      offersAccepted: p.offersAccepted,
      offersDeclined: p.offersDeclined,
      offersExpired: p.offersExpired,
      acceptanceRateBps: acceptanceRateBps(p),
    },
    lastJobAt: p.lastJobAt?.toISOString() ?? null,
  };
}

/** Offer (+ its request) → API DTO / socket payload. */
export function toOfferDto(o: OfferRecord, r: DispatchRequest): DispatchOffer {
  return {
    id: o.id,
    orderId: o.orderId,
    status: o.status,
    pickup: r.pickup,
    dropoff: r.dropoff,
    distanceToPickupM: o.distanceM,
    pickupEtaSeconds: o.etaSeconds,
    readyAt: r.readyAt.toISOString(),
    expiresAt: o.expiresAt.toISOString(),
  };
}

/** Trip → API DTO. */
export function toTripDto(t: TripRecord): Trip {
  return {
    id: t.id,
    orderId: t.orderId,
    riderId: t.riderId,
    status: t.status,
    pickup: t.pickup,
    dropoff: t.dropoff,
    assignment: t.assignment,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
