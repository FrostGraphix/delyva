import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import {
  type ClientToServerEvents,
  type OrderStatusBroadcast,
  orderRoom,
  type RiderLocationBroadcast,
  type ServerToClientEvents,
  SOCKET_EVENTS,
} from '@delyva/contracts';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions, Socket } from 'socket.io';
import type { Principal } from '../../../shared/auth/access-token.verifier.js';
import type { RoomBroadcaster } from '../application/ports.js';

/** Per-socket data set by the auth middleware. */
export interface SocketData {
  principal: Principal;
}

/** Typed server. */
export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
/** Typed socket. */
export type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

/**
 * Nest Socket.IO adapter that installs `@socket.io/redis-adapter`, so room broadcasts reach
 * sockets on every API pod. Pub/sub use dedicated connections (subscriber mode).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly pub: Redis;
  private readonly sub: Redis;

  /** @param app nest app @param redisUrl redis url @param key channel prefix */
  constructor(
    app: INestApplicationContext,
    redisUrl: string,
    private readonly key = 'socket.io',
  ) {
    super(app);
    this.pub = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
    this.sub = this.pub.duplicate();
  }

  /** @inheritdoc */
  override createIOServer(port: number | undefined, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      // Clients must authenticate; keep payloads small for low-end devices.
      maxHttpBufferSize: 16 * 1024,
      pingInterval: 25_000,
      pingTimeout: 20_000,
    } as ServerOptions);
    server.adapter(createAdapter(this.pub, this.sub, { key: this.key }));
    return server;
  }

  /** Closes the server and the pub/sub connections. */
  override async close(server: Server): Promise<void> {
    await super.close(server);
    this.pub.disconnect();
    this.sub.disconnect();
  }
}

/** {@link RoomBroadcaster} over the Socket.IO server (attached by the gateway on init). */
export class SocketRoomBroadcaster implements RoomBroadcaster {
  private server: RealtimeServer | undefined;

  /** Attaches the live server. */
  attach(server: RealtimeServer): void {
    this.server = server;
  }

  /** @inheritdoc */
  riderLocation(payload: RiderLocationBroadcast): void {
    this.server?.to(orderRoom(payload.orderId)).emit(SOCKET_EVENTS.riderLocation, payload);
  }

  /** @inheritdoc */
  orderStatus(payload: OrderStatusBroadcast): void {
    this.server?.to(orderRoom(payload.orderId)).emit(SOCKET_EVENTS.orderStatus, payload);
  }
}
