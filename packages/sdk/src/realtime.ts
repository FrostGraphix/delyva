import {
  type ClientToServerEvents,
  type OrderStatusBroadcast,
  type RiderLocationBroadcast,
  type RiderLocationInput,
  type ServerToClientEvents,
  type SocketAck,
  SOCKET_EVENTS,
} from '@delyva/contracts';
import { io, type Socket } from 'socket.io-client';

/** Typed Socket.IO client socket. */
export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Realtime client options. */
export interface RealtimeClientOptions {
  /** API origin (same host as REST). */
  readonly url: string;
  /** Access token provider; called on every (re)connect so refreshed tokens are used. */
  readonly accessToken: () => string | null;
  /** Ack timeout for emits (poor networks). */
  readonly ackTimeoutMs?: number;
  /** Injectable socket factory (tests). */
  readonly connect?: typeof io;
}

const TIMEOUT_ACK: SocketAck = { ok: false, code: 'internal_error' };

/**
 * Small typed wrapper around socket.io-client: auth via handshake token, acknowledged emits with
 * timeouts, and typed listeners. Falls back to long-polling transport automatically.
 * Apps should poll REST every 10 s while `socket.connected` is false.
 */
export class RealtimeClient {
  /** Underlying socket. */
  readonly socket: RealtimeSocket;
  private readonly ackTimeoutMs: number;

  /** @param options client options */
  constructor(options: RealtimeClientOptions) {
    const connect = options.connect ?? io;
    this.ackTimeoutMs = options.ackTimeoutMs ?? 8_000;
    this.socket = connect(options.url, {
      auth: (cb: (data: object) => void) => {
        cb({ token: options.accessToken() });
      },
      reconnectionDelayMax: 10_000,
      autoConnect: true,
    });
  }

  /** Sends a rider location fix (riders only). */
  sendLocation(fix: RiderLocationInput): Promise<SocketAck> {
    return this.ack((cb) => this.socket.emit(SOCKET_EVENTS.riderLocation, fix, cb));
  }

  /** Joins an order room (customer, rider, vendor of that order, or ops). */
  joinOrder(orderId: string): Promise<SocketAck> {
    return this.ack((cb) => this.socket.emit(SOCKET_EVENTS.orderJoin, { orderId }, cb));
  }

  /** Leaves an order room. */
  leaveOrder(orderId: string): Promise<SocketAck> {
    return this.ack((cb) => this.socket.emit(SOCKET_EVENTS.orderLeave, { orderId }, cb));
  }

  /** Subscribes to live rider locations; returns an unsubscribe function. */
  onRiderLocation(listener: (p: RiderLocationBroadcast) => void): () => void {
    this.socket.on(SOCKET_EVENTS.riderLocation, listener);
    return () => this.socket.off(SOCKET_EVENTS.riderLocation, listener);
  }

  /** Subscribes to order status updates; returns an unsubscribe function. */
  onOrderStatus(listener: (p: OrderStatusBroadcast) => void): () => void {
    this.socket.on(SOCKET_EVENTS.orderStatus, listener);
    return () => this.socket.off(SOCKET_EVENTS.orderStatus, listener);
  }

  /** Closes the connection. */
  close(): void {
    this.socket.disconnect();
  }

  private ack(send: (cb: (res: SocketAck) => void) => unknown): Promise<SocketAck> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(TIMEOUT_ACK);
      }, this.ackTimeoutMs);
      send((res) => {
        clearTimeout(timer);
        resolve(res);
      });
    });
  }
}
