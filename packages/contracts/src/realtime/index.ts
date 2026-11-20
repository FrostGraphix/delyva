import { z } from 'zod';
import type { DispatchOffer } from '../dispatch/dispatch.js';

/** Max age of a location fix the server accepts (ms). Older points are stale. */
export const LOCATION_MAX_AGE_MS = 5 * 60_000;
/** Max clock skew into the future the server accepts (ms). */
export const LOCATION_MAX_FUTURE_SKEW_MS = 30_000;
/** Max points in one HTTP fallback batch. */
export const LOCATION_BATCH_MAX = 50;

/** One rider location fix. `ts` is epoch milliseconds from the device clock. */
export const RiderLocationSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).lt(360).nullable().default(null),
  ts: z.number().int().positive(),
});
/** Rider location fix (input; heading optional). */
export type RiderLocationInput = z.input<typeof RiderLocationSchema>;
/** Rider location fix (parsed). */
export type RiderLocation = z.infer<typeof RiderLocationSchema>;

/** POST /v1/riders/me/locations body: points in chronological order. */
export const RiderLocationBatchSchema = z.strictObject({
  points: z.array(RiderLocationSchema).min(1).max(LOCATION_BATCH_MAX),
});
/** HTTP fallback batch (input). */
export type RiderLocationBatch = z.input<typeof RiderLocationBatchSchema>;

/** POST /v1/riders/me/locations 202 response. */
export const LocationBatchResultSchema = z.strictObject({
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
});
/** HTTP fallback result. */
export type LocationBatchResult = z.infer<typeof LocationBatchResultSchema>;

/** `order:join` / `order:leave` payload. */
export const OrderRoomRequestSchema = z.strictObject({ orderId: z.uuid() });
/** Room join request. */
export type OrderRoomRequest = z.infer<typeof OrderRoomRequestSchema>;

/** Socket acknowledgement. */
export type SocketAck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: 'validation_failed' | 'forbidden' | 'rate_limited' | 'internal_error';
    };

/** Location broadcast to an order room (`rider:location`). */
export interface RiderLocationBroadcast {
  readonly riderId: string;
  readonly orderId: string;
  readonly lat: number;
  readonly lng: number;
  readonly heading: number | null;
  readonly ts: number;
}

/** Order status broadcast to an order room (`order:status`). */
export interface OrderStatusBroadcast {
  readonly orderId: string;
  readonly status: string;
  readonly at: string;
}

/** Socket.IO event names (single source of truth for server and clients). */
export const SOCKET_EVENTS = {
  riderLocation: 'rider:location',
  orderJoin: 'order:join',
  orderLeave: 'order:leave',
  orderStatus: 'order:status',
  dispatchOffer: 'dispatch:offer',
} as const;

/** Events the server emits to clients. */
export interface ServerToClientEvents {
  /** Live rider position for an order the client has joined. */
  'rider:location': (payload: RiderLocationBroadcast) => void;
  /** Order status change. */
  'order:status': (payload: OrderStatusBroadcast) => void;
  /** Job offer to one rider (sent to the `rider:<id>` room only). */
  'dispatch:offer': (payload: DispatchOffer) => void;
}

/** Events clients emit to the server (all acknowledged). */
export interface ClientToServerEvents {
  /** Rider location fix (riders only). */
  'rider:location': (payload: RiderLocationInput, ack: (res: SocketAck) => void) => void;
  /** Join an order room (participants and ops only). */
  'order:join': (payload: OrderRoomRequest, ack: (res: SocketAck) => void) => void;
  /** Leave an order room. */
  'order:leave': (payload: OrderRoomRequest, ack: (res: SocketAck) => void) => void;
}

/** Room name for an order. */
export const orderRoom = (orderId: string): string => `order:${orderId}`;
/** Room name for a rider. */
export const riderRoom = (riderId: string): string => `rider:${riderId}`;
