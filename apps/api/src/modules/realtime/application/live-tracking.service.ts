import type { RiderLocation } from '@delyva/contracts';
import { partitionFixes } from '../domain/location-policy.js';
import type { LocationStore, NearbyRider, RiderPosition, RoomBroadcaster } from './ports.js';

/** Result of ingesting fixes. */
export interface IngestResult {
  readonly accepted: number;
  readonly rejected: number;
}

/**
 * Public interface of live tracking for other contexts (dispatch, ordering). Swap the
 * implementation without touching callers.
 */
export interface LiveTrackingService {
  /** Validates freshness, writes the newest fix to GEO and fans it out to the active order room only. */
  ingest(riderId: string, fixes: readonly RiderLocation[]): Promise<IngestResult>;
  /** Last known position. */
  positionOf(riderId: string): Promise<RiderPosition | null>;
  /** Riders within `radiusM` of a point (candidates for dispatch). */
  ridersNear(lat: number, lng: number, radiusM: number, limit: number): Promise<NearbyRider[]>;
  /** Binds a rider to the order whose room receives their location. */
  startTrip(riderId: string, orderId: string): Promise<void>;
  /** Stops sharing the rider's location (e.g. on DELIVERED). */
  endTrip(riderId: string): Promise<void>;
  /** Pushes an order status update to the order room. */
  publishOrderStatus(orderId: string, status: string, at: Date): void;
}

/** DI token for {@link LiveTrackingService}. */
export const LIVE_TRACKING = Symbol('LIVE_TRACKING');

/** Default implementation over a {@link LocationStore} and {@link RoomBroadcaster}. */
export class DefaultLiveTrackingService implements LiveTrackingService {
  /** @param store location store @param rooms broadcaster @param now clock */
  constructor(
    private readonly store: LocationStore,
    private readonly rooms: RoomBroadcaster,
    private readonly now: () => number = Date.now,
  ) {}

  /** @inheritdoc */
  async ingest(riderId: string, fixes: readonly RiderLocation[]): Promise<IngestResult> {
    const { fresh, rejected } = partitionFixes(fixes, this.now());
    const latest = fresh.at(-1);
    if (!latest) return { accepted: 0, rejected };
    // DEBT(realtime): only the newest fix is stored; no downsampled trail for disputes yet — persist a trail table (90-day retention).
    const written = await this.store.write(riderId, latest);
    const orderId = written ? await this.store.activeOrderOf(riderId) : null;
    if (orderId) {
      this.rooms.riderLocation({ riderId, orderId, ...latest });
    }
    return { accepted: fresh.length, rejected };
  }

  /** @inheritdoc */
  positionOf(riderId: string): Promise<RiderPosition | null> {
    return this.store.last(riderId);
  }

  /** @inheritdoc */
  ridersNear(lat: number, lng: number, radiusM: number, limit: number): Promise<NearbyRider[]> {
    return this.store.near(lat, lng, radiusM, limit);
  }

  /** @inheritdoc */
  startTrip(riderId: string, orderId: string): Promise<void> {
    return this.store.setActiveOrder(riderId, orderId);
  }

  /** @inheritdoc */
  endTrip(riderId: string): Promise<void> {
    return this.store.setActiveOrder(riderId, null);
  }

  /** @inheritdoc */
  publishOrderStatus(orderId: string, status: string, at: Date): void {
    this.rooms.orderStatus({ orderId, status, at: at.toISOString() });
  }
}
