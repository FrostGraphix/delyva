import { randomUUID } from 'node:crypto';
import {
  type DynamicModule,
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type Provider,
  type Type,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import type { Logger } from 'pino';
import { ACCESS_TOKEN_VERIFIER, AuthGuard } from '../../shared/auth/auth.guard.js';
import { JoseAccessTokenVerifier } from '../../shared/auth/jose-access-token.verifier.js';
import { ENV, type Env } from '../../shared/config/env.js';
import { DB, type Db, PG_POOL } from '../../shared/database/database.js';
import { LOGGER } from '../../shared/logging/logger.js';
import { REDIS } from '../../shared/redis/redis.js';
import { GeoService } from '../geo/application/geo.service.js';
import { GeoModule } from '../geo/geo.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JoseAccessTokenSigner } from '../identity/infrastructure/jose-access-token.signer.js';
import { NotifyUser } from '../notifications/application/notify-user.use-case.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import {
  LIVE_TRACKING,
  type LiveTrackingService,
} from '../realtime/application/live-tracking.service.js';
import { SocketRoomBroadcaster } from '../realtime/infrastructure/socket-io.js';
import { DispatchAdminController } from './api/dispatch-admin.controller.js';
import { DispatchOffersController } from './api/dispatch-offers.controller.js';
import { RidersController } from './api/riders.controller.js';
import { TripsController } from './api/trips.controller.js';
import { HandleOrderingEvent } from './application/handle-ordering-event.use-case.js';
import { OpsDispatch } from './application/ops-dispatch.use-cases.js';
import { ORDER_FULFILMENT_PORT, type OrderFulfilmentPort } from '@delyva/contracts';
import {
  type Clock,
  DISPATCH_CLOCK,
  DISPATCH_CONFIG,
  DISPATCH_SCHEDULER,
  DISPATCH_STORE,
  DISPATCH_STRATEGY,
  type DispatchConfig,
  type DispatchScheduler,
  type DispatchStore,
  OFFER_NOTIFIER,
  type OfferNotifier,
  ORDER_LOCK,
  type OrderLock,
  ZONE_LOOKUP,
  type ZoneLookup,
} from './application/ports.js';
import { RespondToOffer } from './application/respond-to-offer.use-cases.js';
import { RiderSelfService } from './application/rider-availability.use-cases.js';
import { RunDispatchRound } from './application/run-dispatch-round.use-case.js';
import { ScheduleDispatch } from './application/schedule-dispatch.use-case.js';
import { PerformTripAction } from './application/trip-actions.use-case.js';
import { type DispatchStrategy, EtaFirstStrategy } from './domain/dispatch-strategy.js';
import { GeoZoneLookup, SocketAndPushOfferNotifier } from './infrastructure/adapters.js';
import { BullMqDispatchScheduler, DispatchWorker } from './infrastructure/bullmq-dispatch.queue.js';
import { DrizzleDispatchStore } from './infrastructure/drizzle-dispatch.store.js';
import { OutboxDispatchConsumer } from './infrastructure/outbox-dispatch.consumer.js';
import { RedisOrderLock } from './infrastructure/redis-order.lock.js';

/** Offline-replayed actions may carry a device fix up to 30 minutes old. */
const GPS_REPLAY_MAX_AGE_MS = 30 * 60_000;

/** Builds {@link DispatchConfig} from the validated env. */
export function dispatchConfigFromEnv(env: Env): DispatchConfig {
  return {
    offerTimeoutMs: env.DISPATCH_OFFER_TIMEOUT_MS,
    radiiM: env.DISPATCH_RADII_M,
    declinesBeforeWiden: env.DISPATCH_DECLINES_BEFORE_WIDEN,
    maxOffers: env.DISPATCH_MAX_OFFERS,
    gpsMaxDistanceM: env.DISPATCH_GPS_MAX_DISTANCE_M,
    gpsReplayMaxAgeMs: GPS_REPLAY_MAX_AGE_MS,
    riderSpeedMps: env.DISPATCH_RIDER_SPEED_MPS,
    defaultTravelSeconds: env.DISPATCH_DEFAULT_TRAVEL_SECONDS,
    minBatteryPct: env.DISPATCH_MIN_BATTERY_PCT,
  };
}

/** Options for {@link DispatchModule.forRoot}. */
export interface DispatchModuleOptions {
  /** The same RealtimeModule reference the app imports (static or `withAuthorizer`). */
  readonly realtime: Type | DynamicModule;
  /** The ordering module (exports the real ORDER_FULFILMENT_PORT); same instance the app imports. */
  readonly ordering?: Type | DynamicModule;
  /** Test double for the fulfilment port (e.g. InMemoryOrderFulfilment); overrides `ordering`. */
  readonly orderFulfilment?: OrderFulfilmentPort;
}

const systemClock: Clock = { now: () => new Date(), uuid: () => randomUUID() };

const factories: Provider[] = [
  { provide: DISPATCH_CLOCK, useValue: systemClock },
  { provide: DISPATCH_STRATEGY, useClass: EtaFirstStrategy },
  { provide: DISPATCH_CONFIG, inject: [ENV], useFactory: dispatchConfigFromEnv },
  { provide: DISPATCH_STORE, inject: [DB], useFactory: (db: Db) => new DrizzleDispatchStore(db) },
  { provide: ORDER_LOCK, inject: [REDIS], useFactory: (r: Redis) => new RedisOrderLock(r) },
  {
    provide: ZONE_LOOKUP,
    inject: [GeoService],
    useFactory: (g: GeoService) => new GeoZoneLookup(g),
  },
  {
    provide: DISPATCH_SCHEDULER,
    inject: [ENV],
    useFactory: (env: Env) => new BullMqDispatchScheduler(env.REDIS_URL, env.BULLMQ_PREFIX),
  },
  {
    provide: OFFER_NOTIFIER,
    inject: [SocketRoomBroadcaster, NotifyUser],
    useFactory: (rooms: SocketRoomBroadcaster, notify: NotifyUser) =>
      new SocketAndPushOfferNotifier(rooms, notify),
  },
  {
    provide: RiderSelfService,
    inject: [DISPATCH_STORE, DISPATCH_CONFIG],
    useFactory: (s: DispatchStore, c: DispatchConfig) => new RiderSelfService(s, c),
  },
  {
    provide: ScheduleDispatch,
    inject: [DISPATCH_STORE, LIVE_TRACKING, DISPATCH_SCHEDULER, DISPATCH_CLOCK, DISPATCH_CONFIG],
    useFactory: (
      store: DispatchStore,
      tracking: LiveTrackingService,
      scheduler: DispatchScheduler,
      clock: Clock,
      config: DispatchConfig,
    ) => new ScheduleDispatch({ store, tracking, scheduler, clock, config }),
  },
  {
    provide: HandleOrderingEvent,
    inject: [ScheduleDispatch],
    useFactory: (s: ScheduleDispatch) => new HandleOrderingEvent(s),
  },
  {
    provide: RunDispatchRound,
    inject: [
      DISPATCH_STORE,
      LIVE_TRACKING,
      ZONE_LOOKUP,
      DISPATCH_STRATEGY,
      ORDER_LOCK,
      DISPATCH_SCHEDULER,
      OFFER_NOTIFIER,
      DISPATCH_CLOCK,
      DISPATCH_CONFIG,
      LOGGER,
    ],
    useFactory: (
      store: DispatchStore,
      tracking: LiveTrackingService,
      zones: ZoneLookup,
      strategy: DispatchStrategy,
      lock: OrderLock,
      scheduler: DispatchScheduler,
      notifier: OfferNotifier,
      clock: Clock,
      config: DispatchConfig,
      logger: Logger,
    ) =>
      new RunDispatchRound({
        store,
        tracking,
        zones,
        strategy,
        lock,
        scheduler,
        notifier,
        clock,
        config,
        logger,
      }),
  },
  {
    provide: RespondToOffer,
    inject: [
      DISPATCH_STORE,
      ORDER_FULFILMENT_PORT,
      LIVE_TRACKING,
      DISPATCH_CLOCK,
      ORDER_LOCK,
      DISPATCH_SCHEDULER,
      DISPATCH_CONFIG,
    ],
    useFactory: (
      store: DispatchStore,
      port: OrderFulfilmentPort,
      tracking: LiveTrackingService,
      clock: Clock,
      lock: OrderLock,
      scheduler: DispatchScheduler,
      config: DispatchConfig,
    ) => new RespondToOffer({ store, port, tracking, clock, lock, scheduler, config }),
  },
  {
    provide: PerformTripAction,
    inject: [
      DISPATCH_STORE,
      ORDER_FULFILMENT_PORT,
      LIVE_TRACKING,
      ORDER_LOCK,
      DISPATCH_CLOCK,
      DISPATCH_CONFIG,
      LOGGER,
    ],
    useFactory: (
      store: DispatchStore,
      port: OrderFulfilmentPort,
      tracking: LiveTrackingService,
      lock: OrderLock,
      clock: Clock,
      config: DispatchConfig,
      logger: Logger,
    ) => new PerformTripAction({ store, port, tracking, lock, clock, config, logger }),
  },
  {
    provide: OpsDispatch,
    inject: [
      DISPATCH_STORE,
      ORDER_FULFILMENT_PORT,
      LIVE_TRACKING,
      DISPATCH_CLOCK,
      ORDER_LOCK,
      LOGGER,
    ],
    useFactory: (
      store: DispatchStore,
      port: OrderFulfilmentPort,
      tracking: LiveTrackingService,
      clock: Clock,
      lock: OrderLock,
      logger: Logger,
    ) => new OpsDispatch({ store, port, tracking, clock, lock, logger }),
  },
  {
    provide: OutboxDispatchConsumer,
    inject: [PG_POOL, HandleOrderingEvent, LOGGER],
    useFactory: (pool: pg.Pool, h: HandleOrderingEvent, logger: Logger) =>
      new OutboxDispatchConsumer(pool, h, logger),
  },
  {
    provide: DispatchWorker,
    inject: [ENV, RunDispatchRound, RespondToOffer, LOGGER],
    useFactory: (env: Env, rounds: RunDispatchRound, offers: RespondToOffer, logger: Logger) =>
      new DispatchWorker(env.REDIS_URL, env.BULLMQ_PREFIX, rounds, offers, logger),
  },
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
];

/**
 * Dispatch bounded context: rider availability, offers, assignment, trips, ops override.
 * Consumes `ordering.order.vendor_accepted` from the outbox and runs a BullMQ worker for
 * delayed starts, offer timeouts and next-candidate rounds. See ADR 0600.
 */
@Module({})
export class DispatchModule implements OnApplicationBootstrap, OnApplicationShutdown {
  /** Injected collaborators. */
  constructor(
    private readonly consumer: OutboxDispatchConsumer,
    private readonly worker: DispatchWorker,
    @Inject(DISPATCH_SCHEDULER) private readonly scheduler: BullMqDispatchScheduler,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Builds the module bound to the app's realtime module instance. */
  static forRoot(options: DispatchModuleOptions): DynamicModule {
    const port: Provider[] = options.orderFulfilment
      ? [{ provide: ORDER_FULFILMENT_PORT, useValue: options.orderFulfilment }]
      : [];
    if (!options.orderFulfilment && !options.ordering) {
      throw new Error('DispatchModule needs the ordering module or an orderFulfilment double.');
    }
    const ordering = options.orderFulfilment || !options.ordering ? [] : [options.ordering];
    return {
      module: DispatchModule,
      imports: [IdentityModule, GeoModule, NotificationsModule, options.realtime, ...ordering],
      controllers: [
        RidersController,
        DispatchOffersController,
        TripsController,
        DispatchAdminController,
      ],
      providers: [...factories, ...port],
      exports: [
        RunDispatchRound,
        RespondToOffer,
        OutboxDispatchConsumer,
        DispatchWorker,
        DISPATCH_SCHEDULER,
      ],
    };
  }

  /** Starts the outbox consumer and the job worker unless disabled. */
  onApplicationBootstrap(): void {
    if (this.env.DISPATCH_CONSUMER_ENABLED) this.consumer.start();
    if (this.env.DISPATCH_WORKER_ENABLED) this.worker.start();
  }

  /** Stops polling and closes BullMQ connections. */
  async onApplicationShutdown(): Promise<void> {
    this.consumer.stop();
    await this.worker.stop();
    await this.scheduler.close();
  }
}
