import { type DynamicModule, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ACCESS_TOKEN_VERIFIER, AuthGuard } from '../../shared/auth/auth.guard.js';
import { JoseAccessTokenVerifier } from '../../shared/auth/jose-access-token.verifier.js';
import { JoseAccessTokenSigner } from '../identity/infrastructure/jose-access-token.signer.js';
import { ENV, type Env } from '../../shared/config/env.js';
import { REDIS } from '../../shared/redis/redis.js';
import { IdentityModule } from '../identity/identity.module.js';
import { RealtimeGateway } from './api/realtime.gateway.js';
import { RiderLocationsController } from './api/rider-locations.controller.js';
import { DefaultLiveTrackingService, LIVE_TRACKING } from './application/live-tracking.service.js';
import { ORDER_ROOM_AUTHORIZER, type OrderRoomAuthorizer } from './application/ports.js';
import { DenyByDefaultOrderRoomAuthorizer } from './infrastructure/order-room.authorizers.js';
import {
  RedisLocationRateLimiter,
  RedisLocationStore,
} from './infrastructure/redis-location.store.js';
import { SocketRoomBroadcaster } from './infrastructure/socket-io.js';

/**
 * Realtime gateway infrastructure: Socket.IO rooms, rider location ingestion (WS + HTTP),
 * and the {@link LIVE_TRACKING} service exported for dispatch/ordering.
 * The ordering module overrides {@link ORDER_ROOM_AUTHORIZER} with a participant check.
 */
@Module({
  imports: [IdentityModule],
  controllers: [RiderLocationsController],
  providers: [
    {
      provide: ACCESS_TOKEN_VERIFIER,
      inject: [JoseAccessTokenSigner, ENV],
      useFactory: (signer: JoseAccessTokenSigner, env: Env) =>
        new JoseAccessTokenVerifier({
          key: signer.verificationKey,
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        }),
    },
    AuthGuard,
    RealtimeGateway,
    SocketRoomBroadcaster,
    { provide: ORDER_ROOM_AUTHORIZER, useClass: DenyByDefaultOrderRoomAuthorizer },
    {
      provide: RedisLocationStore,
      inject: [REDIS],
      useFactory: (r: Redis) => new RedisLocationStore(r),
    },
    {
      provide: RedisLocationRateLimiter,
      inject: [REDIS],
      useFactory: (r: Redis) => new RedisLocationRateLimiter(r),
    },
    {
      provide: LIVE_TRACKING,
      inject: [RedisLocationStore, SocketRoomBroadcaster],
      useFactory: (store: RedisLocationStore, rooms: SocketRoomBroadcaster) =>
        new DefaultLiveTrackingService(store, rooms),
    },
  ],
  exports: [LIVE_TRACKING, ORDER_ROOM_AUTHORIZER],
})
export class RealtimeModule {
  /** Replaces the deny-by-default authorizer (ordering module implementation, or a test double). */
  static withAuthorizer(authorizer: OrderRoomAuthorizer): DynamicModule {
    return {
      module: RealtimeModule,
      providers: [{ provide: ORDER_ROOM_AUTHORIZER, useValue: authorizer }],
    };
  }
}
