import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import {
  OrderRoomRequestSchema,
  orderRoom,
  RiderLocationSchema,
  riderRoom,
  type SocketAck,
  SOCKET_EVENTS,
} from '@delyva/contracts';
import type { Logger } from 'pino';
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifier,
} from '../../../shared/auth/auth.guard.js';
import { LOGGER } from '../../../shared/logging/logger.js';
import { LIVE_TRACKING, type LiveTrackingService } from '../application/live-tracking.service.js';
import {
  type LocationRateLimiter,
  ORDER_ROOM_AUTHORIZER,
  type OrderRoomAuthorizer,
} from '../application/ports.js';
import { isOpsStaff, isRider, SOCKET_LOCATION_LIMIT } from '../domain/location-policy.js';
import { RedisLocationRateLimiter } from '../infrastructure/redis-location.store.js';
import {
  type RealtimeServer,
  type RealtimeSocket,
  SocketRoomBroadcaster,
} from '../infrastructure/socket-io.js';

const fail = (code: Exclude<SocketAck, { ok: true }>['code']): SocketAck => ({ ok: false, code });
const OK: SocketAck = { ok: true };

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer ([\w.-]+)$/i.exec(header?.trim() ?? '');
  return match?.[1] ?? null;
}

/**
 * Socket.IO gateway: JWT handshake auth, per-order/per-rider rooms with an authorization hook,
 * and `rider:location` ingestion. Handlers return the ack payload.
 */
@WebSocketGateway({ cors: false, serveClient: false })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  /** Injected collaborators. */
  constructor(
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier,
    @Inject(ORDER_ROOM_AUTHORIZER) private readonly authorizer: OrderRoomAuthorizer,
    @Inject(LIVE_TRACKING) private readonly tracking: LiveTrackingService,
    @Inject(RedisLocationRateLimiter) private readonly limiter: LocationRateLimiter,
    private readonly broadcaster: SocketRoomBroadcaster,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** Installs the auth middleware: every connection needs a valid access JWT. */
  afterInit(server: RealtimeServer): void {
    this.broadcaster.attach(server);
    server.use((socket, next) => {
      const auth = socket.handshake.auth as { token?: unknown };
      const token =
        typeof auth.token === 'string'
          ? auth.token
          : bearerToken(socket.handshake.headers.authorization);
      if (!token) {
        next(new Error('unauthorized'));
        return;
      }
      this.verifier.verify(token).then(
        (principal) => {
          socket.data.principal = principal;
          next();
        },
        () => {
          next(new Error('unauthorized'));
        },
      );
    });
  }

  /** Riders join their own room on connect. */
  async handleConnection(socket: RealtimeSocket): Promise<void> {
    const { principal } = socket.data;
    if (isRider(principal.roles)) await socket.join(riderRoom(principal.userId));
  }

  /** `order:join` — ops staff, or participants approved by the {@link OrderRoomAuthorizer}. */
  @SubscribeMessage(SOCKET_EVENTS.orderJoin)
  async join(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<SocketAck> {
    const parsed = OrderRoomRequestSchema.safeParse(body);
    if (!parsed.success) return fail('validation_failed');
    const { principal } = socket.data;
    const allowed =
      isOpsStaff(principal.roles) ||
      (await this.authorizer.canJoin(principal, parsed.data.orderId));
    if (!allowed) return fail('forbidden');
    await socket.join(orderRoom(parsed.data.orderId));
    return OK;
  }

  /** `order:leave` */
  @SubscribeMessage(SOCKET_EVENTS.orderLeave)
  async leave(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<SocketAck> {
    const parsed = OrderRoomRequestSchema.safeParse(body);
    if (!parsed.success) return fail('validation_failed');
    await socket.leave(orderRoom(parsed.data.orderId));
    return OK;
  }

  /** `rider:location` — riders only, validated, rate limited, written to GEO and fanned out. */
  @SubscribeMessage(SOCKET_EVENTS.riderLocation)
  async location(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<SocketAck> {
    const { principal } = socket.data;
    if (!isRider(principal.roles)) return fail('forbidden');
    const parsed = RiderLocationSchema.safeParse(body);
    if (!parsed.success) return fail('validation_failed');
    const { limit, windowSeconds } = SOCKET_LOCATION_LIMIT;
    if (!(await this.limiter.hit(`rl:loc:ws:${principal.userId}`, limit, windowSeconds))) {
      return fail('rate_limited');
    }
    try {
      const result = await this.tracking.ingest(principal.userId, [parsed.data]);
      return result.accepted > 0 ? OK : fail('validation_failed');
    } catch (err) {
      this.logger.warn({ err }, 'rider location ingest failed');
      return fail('internal_error');
    }
  }
}
