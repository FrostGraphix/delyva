import type { AuthPrincipal } from '../../../shared/auth/auth.guard.js';
import type {
  OrderStatusBroadcast,
  RiderLocation,
  RiderLocationBroadcast,
} from '@delyva/contracts';

/**
 * Decides whether a principal may join `order:<id>`. The ordering context implements this
 * (customer, assigned rider, vendor staff of the branch). Ops staff are allowed before this is
 * consulted. Implementations must deny when unsure.
 */
export interface OrderRoomAuthorizer {
  /** True only for participants of the order. */
  canJoin(principal: AuthPrincipal, orderId: string): Promise<boolean>;
}

/** DI token for the {@link OrderRoomAuthorizer}. */
export const ORDER_ROOM_AUTHORIZER = Symbol('ORDER_ROOM_AUTHORIZER');

/** Last-known rider position. */
export interface RiderPosition {
  readonly lat: number;
  readonly lng: number;
  readonly heading: number | null;
  readonly ts: number;
}

/** Rider near a point. */
export interface NearbyRider {
  readonly riderId: string;
  readonly distanceM: number;
}

/** Live location state (Redis GEO). */
export interface LocationStore {
  /** GEOADD + last-fix hash; ignores fixes older than the stored one. Returns false when ignored. */
  write(riderId: string, fix: RiderLocation): Promise<boolean>;
  /** Last fix of a rider. */
  last(riderId: string): Promise<RiderPosition | null>;
  /** GEOSEARCH by radius, nearest first. */
  near(lat: number, lng: number, radiusM: number, limit: number): Promise<NearbyRider[]>;
  /** Active order of a rider. */
  activeOrderOf(riderId: string): Promise<string | null>;
  /** Sets/clears the rider's active order. */
  setActiveOrder(riderId: string, orderId: string | null): Promise<void>;
}

/** Emits to rooms (Socket.IO + Redis adapter, so it fans out across pods). */
export interface RoomBroadcaster {
  /** Location to one order room. */
  riderLocation(payload: RiderLocationBroadcast): void;
  /** Status to one order room. */
  orderStatus(payload: OrderStatusBroadcast): void;
}

/** Sliding-window limiter. */
export interface LocationRateLimiter {
  /** Records a hit and says whether it is allowed. */
  hit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}
