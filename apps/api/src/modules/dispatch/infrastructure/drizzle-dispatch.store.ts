import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import { appendToOutbox } from '../../../shared/outbox/outbox.writer.js';
import type {
  DispatchEvent,
  DispatchRequest,
  DispatchStore,
  OfferRecord,
  OfferStatus,
  RiderCounter,
  TripRecord,
} from '../application/ports.js';
import type { RiderProfileState, RiderStatus } from '../domain/rider.js';
import { ACTIVE_TRIP_STATUSES, type TripStatus } from '../domain/trip.js';
import { dispatchOffers, dispatchRequests, riderProfiles, trips } from './dispatch.schema.js';

/** A Drizzle db or transaction handle. */
type Handle = Pick<Db, 'select' | 'insert' | 'update' | 'transaction'>;

const COUNTER_COLUMNS = {
  offersReceived: riderProfiles.offersReceived,
  offersAccepted: riderProfiles.offersAccepted,
  offersDeclined: riderProfiles.offersDeclined,
  offersExpired: riderProfiles.offersExpired,
} as const;

const toRider = (r: typeof riderProfiles.$inferSelect): RiderProfileState => ({
  riderId: r.userId,
  vehiclePlate: r.vehiclePlate,
  hub: r.hub,
  batteryPct: r.batteryPct,
  status: r.status as RiderStatus,
  offersReceived: r.offersReceived,
  offersAccepted: r.offersAccepted,
  offersDeclined: r.offersDeclined,
  offersExpired: r.offersExpired,
  ratingX100: r.ratingX100,
  lastJobAt: r.lastJobAt,
});

const toRequest = (r: typeof dispatchRequests.$inferSelect): DispatchRequest => ({
  orderId: r.orderId,
  branchId: r.branchId,
  pickup: { lat: r.pickupLat, lng: r.pickupLng },
  dropoff: { lat: r.dropoffLat, lng: r.dropoffLng },
  prepMinutes: r.prepMinutes,
  readyAt: r.readyAt,
  status: r.status as DispatchRequest['status'],
  radiusStep: r.radiusStep,
  declines: r.declines,
  attempts: r.attempts,
});

const toOffer = (r: typeof dispatchOffers.$inferSelect): OfferRecord => ({
  id: r.id,
  orderId: r.orderId,
  riderId: r.riderId,
  status: r.status as OfferStatus,
  radiusM: r.radiusM,
  distanceM: r.distanceM,
  etaSeconds: r.etaSeconds,
  expiresAt: r.expiresAt,
  createdAt: r.createdAt,
});

const toTrip = (r: typeof trips.$inferSelect): TripRecord => ({
  id: r.id,
  orderId: r.orderId,
  riderId: r.riderId,
  offerId: r.offerId,
  status: r.status as TripStatus,
  pickup: { lat: r.pickupLat, lng: r.pickupLng },
  dropoff: { lat: r.dropoffLat, lng: r.dropoffLng },
  assignment: r.assignment as TripRecord['assignment'],
  assignedBy: r.assignedBy,
  assignmentReason: r.assignmentReason,
  undeliverableReason: r.undeliverableReason,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const activeTrip = inArray(trips.status, [...ACTIVE_TRIP_STATUSES]);

/** Postgres implementation of {@link DispatchStore} (Drizzle; outbox in the same transaction). */
export class DrizzleDispatchStore implements DispatchStore {
  /** @param db db or transaction handle */
  constructor(private readonly db: Handle) {}

  /** @inheritdoc */
  transaction<T>(fn: (tx: DispatchStore) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new DrizzleDispatchStore(tx)));
  }

  /** @inheritdoc */
  async emit(event: DispatchEvent): Promise<void> {
    await appendToOutbox(this.db, event);
  }

  /** @inheritdoc */
  async getRider(riderId: string): Promise<RiderProfileState | null> {
    const [row] = await this.db
      .select()
      .from(riderProfiles)
      .where(eq(riderProfiles.userId, riderId));
    return row ? toRider(row) : null;
  }

  /** @inheritdoc */
  async ensureRider(riderId: string): Promise<RiderProfileState> {
    await this.db.insert(riderProfiles).values({ userId: riderId }).onConflictDoNothing();
    const rider = await this.getRider(riderId);
    if (!rider) throw new Error('rider profile upsert failed');
    return rider;
  }

  /** @inheritdoc */
  async setRiderStatus(riderId: string, status: RiderStatus, batteryPct?: number): Promise<void> {
    await this.db
      .update(riderProfiles)
      .set({
        status,
        ...(batteryPct === undefined ? {} : { batteryPct }),
        statusChangedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(riderProfiles.userId, riderId));
  }

  /** @inheritdoc */
  async incrementRider(riderId: string, counter: RiderCounter): Promise<void> {
    const col = COUNTER_COLUMNS[counter];
    await this.db
      .update(riderProfiles)
      .set({ [counter]: sql`${col} + 1`, updatedAt: sql`now()` })
      .where(eq(riderProfiles.userId, riderId));
  }

  /** @inheritdoc */
  async setLastJobAt(riderId: string, at: Date): Promise<void> {
    await this.db
      .update(riderProfiles)
      .set({ lastJobAt: at, updatedAt: sql`now()` })
      .where(eq(riderProfiles.userId, riderId));
  }

  /** @inheritdoc */
  async ridersByIds(riderIds: readonly string[]): Promise<RiderProfileState[]> {
    if (riderIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(riderProfiles)
      .where(inArray(riderProfiles.userId, [...riderIds]));
    return rows.map(toRider);
  }

  /** @inheritdoc */
  async ridersWithStatus(statuses: readonly RiderStatus[]): Promise<RiderProfileState[]> {
    const rows = await this.db
      .select()
      .from(riderProfiles)
      .where(inArray(riderProfiles.status, [...statuses]));
    return rows.map(toRider);
  }

  /** @inheritdoc */
  async insertRequest(r: DispatchRequest): Promise<boolean> {
    const rows = await this.db
      .insert(dispatchRequests)
      .values({
        orderId: r.orderId,
        branchId: r.branchId,
        pickupLat: r.pickup.lat,
        pickupLng: r.pickup.lng,
        dropoffLat: r.dropoff.lat,
        dropoffLng: r.dropoff.lng,
        prepMinutes: r.prepMinutes,
        readyAt: r.readyAt,
        status: r.status,
        radiusStep: r.radiusStep,
        declines: r.declines,
        attempts: r.attempts,
      })
      .onConflictDoNothing()
      .returning({ orderId: dispatchRequests.orderId });
    return rows.length > 0;
  }

  /** @inheritdoc */
  async getRequest(orderId: string): Promise<DispatchRequest | null> {
    const [row] = await this.db
      .select()
      .from(dispatchRequests)
      .where(eq(dispatchRequests.orderId, orderId));
    return row ? toRequest(row) : null;
  }

  /** @inheritdoc */
  async updateRequest(
    orderId: string,
    patch: Partial<Pick<DispatchRequest, 'status' | 'radiusStep' | 'declines' | 'attempts'>>,
  ): Promise<void> {
    await this.db
      .update(dispatchRequests)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(eq(dispatchRequests.orderId, orderId));
  }

  /** @inheritdoc */
  async insertOffer(o: OfferRecord): Promise<void> {
    await this.db.insert(dispatchOffers).values({ ...o });
  }

  /** @inheritdoc */
  async getOffer(offerId: string): Promise<OfferRecord | null> {
    const [row] = await this.db.select().from(dispatchOffers).where(eq(dispatchOffers.id, offerId));
    return row ? toOffer(row) : null;
  }

  /** @inheritdoc */
  async pendingOfferForOrder(orderId: string): Promise<OfferRecord | null> {
    const [row] = await this.db
      .select()
      .from(dispatchOffers)
      .where(and(eq(dispatchOffers.orderId, orderId), eq(dispatchOffers.status, 'pending')));
    return row ? toOffer(row) : null;
  }

  /** @inheritdoc */
  async setOfferStatus(offerId: string, status: OfferStatus, at: Date): Promise<void> {
    await this.db
      .update(dispatchOffers)
      .set({ status, respondedAt: at })
      .where(eq(dispatchOffers.id, offerId));
  }

  /** @inheritdoc */
  async offeredRiderIds(orderId: string): Promise<string[]> {
    const rows = await this.db
      .select({ riderId: dispatchOffers.riderId })
      .from(dispatchOffers)
      .where(eq(dispatchOffers.orderId, orderId));
    return rows.map((r) => r.riderId);
  }

  /** @inheritdoc */
  async ridersWithPendingOffers(riderIds: readonly string[]): Promise<string[]> {
    if (riderIds.length === 0) return [];
    const rows = await this.db
      .select({ riderId: dispatchOffers.riderId })
      .from(dispatchOffers)
      .where(
        and(inArray(dispatchOffers.riderId, [...riderIds]), eq(dispatchOffers.status, 'pending')),
      );
    return rows.map((r) => r.riderId);
  }

  /** @inheritdoc */
  async insertTrip(t: TripRecord): Promise<void> {
    await this.db.insert(trips).values({
      id: t.id,
      orderId: t.orderId,
      riderId: t.riderId,
      offerId: t.offerId,
      status: t.status,
      pickupLat: t.pickup.lat,
      pickupLng: t.pickup.lng,
      dropoffLat: t.dropoff.lat,
      dropoffLng: t.dropoff.lng,
      assignment: t.assignment,
      assignedBy: t.assignedBy,
      assignmentReason: t.assignmentReason,
      undeliverableReason: t.undeliverableReason,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    });
  }

  /** @inheritdoc */
  async getTrip(tripId: string): Promise<TripRecord | null> {
    const [row] = await this.db.select().from(trips).where(eq(trips.id, tripId));
    return row ? toTrip(row) : null;
  }

  /** @inheritdoc */
  async activeTripForRider(riderId: string): Promise<TripRecord | null> {
    const [row] = await this.db
      .select()
      .from(trips)
      .where(and(eq(trips.riderId, riderId), activeTrip));
    return row ? toTrip(row) : null;
  }

  /** @inheritdoc */
  async activeTripForOrder(orderId: string): Promise<TripRecord | null> {
    const [row] = await this.db
      .select()
      .from(trips)
      .where(and(eq(trips.orderId, orderId), activeTrip));
    return row ? toTrip(row) : null;
  }

  /** @inheritdoc */
  async updateTrip(
    tripId: string,
    patch: Pick<TripRecord, 'status' | 'updatedAt'> & { undeliverableReason?: string },
  ): Promise<void> {
    await this.db.update(trips).set(patch).where(eq(trips.id, tripId));
  }

  /** @inheritdoc */
  async countTrips(riderId: string, status: TripStatus): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(trips)
      .where(and(eq(trips.riderId, riderId), eq(trips.status, status)));
    return row?.n ?? 0;
  }
}
