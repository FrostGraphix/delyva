import type { DispatchOffer } from '@delyva/contracts';
import type { LiveTrackingService } from '../../realtime/application/live-tracking.service.js';
import type { RiderProfileState, RiderStatus } from '../domain/rider.js';
import type { TripStatus } from '../domain/trip.js';

/** WGS84 point. */
export interface Point {
  readonly lat: number;
  readonly lng: number;
}

/** Clock + id source. */
export interface Clock {
  now(): Date;
  uuid(): string;
}

/** Tunables (env-driven). */
export interface DispatchConfig {
  readonly offerTimeoutMs: number;
  readonly radiiM: readonly number[];
  readonly declinesBeforeWiden: number;
  readonly maxOffers: number;
  readonly gpsMaxDistanceM: number;
  readonly gpsReplayMaxAgeMs: number;
  readonly riderSpeedMps: number;
  readonly defaultTravelSeconds: number;
  readonly minBatteryPct: number;
}

/** Dispatch request status (per order). */
export type RequestStatus = 'scheduled' | 'searching' | 'assigned' | 'unassigned';

/** Per-order dispatch state. */
export interface DispatchRequest {
  readonly orderId: string;
  readonly branchId: string;
  readonly pickup: Point;
  readonly dropoff: Point;
  readonly prepMinutes: number;
  readonly readyAt: Date;
  readonly status: RequestStatus;
  readonly radiusStep: number;
  readonly declines: number;
  readonly attempts: number;
}

/** Offer status. */
export type OfferStatus = DispatchOffer['status'];

/** Stored offer. */
export interface OfferRecord {
  readonly id: string;
  readonly orderId: string;
  readonly riderId: string;
  readonly status: OfferStatus;
  readonly radiusM: number;
  readonly distanceM: number;
  readonly etaSeconds: number;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

/** Stored trip. */
export interface TripRecord {
  readonly id: string;
  readonly orderId: string;
  readonly riderId: string;
  readonly offerId: string | null;
  readonly status: TripStatus;
  readonly pickup: Point;
  readonly dropoff: Point;
  readonly assignment: 'offer' | 'manual';
  readonly assignedBy: string | null;
  readonly assignmentReason: string | null;
  readonly undeliverableReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Rider counters that use cases increment. */
export type RiderCounter = 'offersReceived' | 'offersAccepted' | 'offersDeclined' | 'offersExpired';

/** Domain event appended to the outbox in the same transaction. */
export interface DispatchEvent {
  readonly type: string;
  readonly aggregateType: 'dispatch_offer' | 'dispatch_order';
  readonly aggregateId: string;
  readonly payload: object;
}

/** Persistence for the dispatch context; `transaction` gives an atomic unit (incl. outbox). */
export interface DispatchStore {
  transaction<T>(fn: (tx: DispatchStore) => Promise<T>): Promise<T>;
  emit(event: DispatchEvent): Promise<void>;

  getRider(riderId: string): Promise<RiderProfileState | null>;
  ensureRider(riderId: string): Promise<RiderProfileState>;
  setRiderStatus(riderId: string, status: RiderStatus, batteryPct?: number): Promise<void>;
  incrementRider(riderId: string, counter: RiderCounter): Promise<void>;
  setLastJobAt(riderId: string, at: Date): Promise<void>;
  ridersByIds(riderIds: readonly string[]): Promise<RiderProfileState[]>;
  ridersWithStatus(statuses: readonly RiderStatus[]): Promise<RiderProfileState[]>;

  /** Inserts the request unless one exists for the order; returns false on duplicate. */
  insertRequest(request: DispatchRequest): Promise<boolean>;
  getRequest(orderId: string): Promise<DispatchRequest | null>;
  updateRequest(
    orderId: string,
    patch: Partial<Pick<DispatchRequest, 'status' | 'radiusStep' | 'declines' | 'attempts'>>,
  ): Promise<void>;

  insertOffer(offer: OfferRecord): Promise<void>;
  getOffer(offerId: string): Promise<OfferRecord | null>;
  pendingOfferForOrder(orderId: string): Promise<OfferRecord | null>;
  setOfferStatus(offerId: string, status: OfferStatus, at: Date): Promise<void>;
  /** Riders already offered this order (any outcome). */
  offeredRiderIds(orderId: string): Promise<string[]>;
  /** Subset of `riderIds` currently holding a pending offer (any order). */
  ridersWithPendingOffers(riderIds: readonly string[]): Promise<string[]>;

  insertTrip(trip: TripRecord): Promise<void>;
  getTrip(tripId: string): Promise<TripRecord | null>;
  activeTripForRider(riderId: string): Promise<TripRecord | null>;
  activeTripForOrder(orderId: string): Promise<TripRecord | null>;
  updateTrip(
    tripId: string,
    patch: Pick<TripRecord, 'status' | 'updatedAt'> & { undeliverableReason?: string },
  ): Promise<void>;
  countTrips(riderId: string, status: TripStatus): Promise<number>;
}

/** Per-order mutual exclusion (Redis lock) so an order is never double-assigned. */
export interface OrderLock {
  /** Runs `fn` holding the order's lock. @throws DispatchError conflict when it stays busy */
  withLock<T>(orderId: string, fn: () => Promise<T>): Promise<T>;
}

/** Delayed/background jobs (BullMQ). Job ids are deterministic so re-scheduling is a no-op. */
export interface DispatchScheduler {
  scheduleStart(orderId: string, delayMs: number): Promise<void>;
  scheduleTimeout(offerId: string, delayMs: number): Promise<void>;
  scheduleNextRound(orderId: string, afterOfferId: string): Promise<void>;
}

/** Delivers an offer to the rider (socket room `rider:<id>` + push). Best effort. */
export interface OfferNotifier {
  offerSent(riderId: string, offer: DispatchOffer, timeoutSeconds: number): Promise<void>;
}

/** Zones covering a point (geo context). */
export interface ZoneLookup {
  zonesContaining(point: Point): Promise<string[]>;
}

/** The live-tracking calls dispatch needs (realtime context's public interface). */
export type Tracking = Pick<
  LiveTrackingService,
  'positionOf' | 'ridersNear' | 'startTrip' | 'endTrip'
>;

/** DI tokens. */
export const DISPATCH_STORE = Symbol('DISPATCH_STORE');
export const ORDER_LOCK = Symbol('ORDER_LOCK');
export const DISPATCH_SCHEDULER = Symbol('DISPATCH_SCHEDULER');
export const OFFER_NOTIFIER = Symbol('OFFER_NOTIFIER');
export const DISPATCH_CONFIG = Symbol('DISPATCH_CONFIG');
export const DISPATCH_CLOCK = Symbol('DISPATCH_CLOCK');
export const ZONE_LOOKUP = Symbol('ZONE_LOOKUP');
export const DISPATCH_STRATEGY = Symbol('DISPATCH_STRATEGY');
