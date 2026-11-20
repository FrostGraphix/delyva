import { randomUUID } from 'node:crypto';
import {
  type DynamicModule,
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';
import { ORDER_FULFILMENT_PORT } from '@delyva/contracts';
import type { Worker } from 'bullmq';
import type pg from 'pg';
import type { Logger } from 'pino';
import { ACCESS_TOKEN_VERIFIER, AuthGuard } from '../../shared/auth/auth.guard.js';
import { JoseAccessTokenVerifier } from '../../shared/auth/jose-access-token.verifier.js';
import { OWNERSHIP_CHECKER } from '../../shared/auth/ownership.guard.js';
import { ENV, type Env } from '../../shared/config/env.js';
import { DB, type Db, PG_POOL } from '../../shared/database/database.js';
import { LOGGER } from '../../shared/logging/logger.js';
import { CatalogService } from '../catalog/application/catalog.service.js';
import { buildCatalogService, CatalogModule } from '../catalog/catalog.module.js';
import { GeoService } from '../geo/application/geo.service.js';
import { GeoModule } from '../geo/geo.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JoseAccessTokenSigner } from '../identity/infrastructure/jose-access-token.signer.js';
import { PaymentsService } from '../payments/application/payments.service.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PricingService } from '../pricing/application/pricing.service.js';
import { TransactionalRedeemPromo } from '../pricing/infrastructure/transactional-redeem-promo.js';
import { PricingModule } from '../pricing/pricing.module.js';
import {
  LIVE_TRACKING,
  type LiveTrackingService,
} from '../realtime/application/live-tracking.service.js';
import { ORDER_ROOM_AUTHORIZER } from '../realtime/application/ports.js';
import {
  AdminOrdersController,
  CartsController,
  OrdersController,
  VendorOrderActionsController,
  VendorOrdersListController,
} from './api/ordering.controllers.js';
import {
  AddCartLineUseCase,
  type CartDeps,
  DeleteCartUseCase,
  GetCart,
  ListCarts,
  RemoveCartLineUseCase,
  UpdateCartLineUseCase,
} from './application/cart.use-cases.js';
import { Checkout } from './application/checkout.use-case.js';
import {
  AutoRejectOrder,
  CancelOrderByCustomer,
  CancelOrderByOps,
  type OrderCommandDeps,
  VendorOrderActions,
} from './application/order-commands.use-cases.js';
import { OrderFulfilmentService } from './application/order-fulfilment.service.js';
import { OrderLifecycle } from './application/order-lifecycle.js';
import { OrderQueries, OrderRoomAccess } from './application/order-queries.js';
import { HandlePaymentEvent } from './application/payment-events.use-case.js';
import type {
  CatalogPort,
  Clock,
  GeoPort,
  OrderCodes,
  OrderingConfig,
  PaymentsPort,
  PricingPort,
  TrackingPort,
} from './application/ports.js';
import {
  BullMqAutoRejectScheduler,
  HmacOrderCodes,
  OutboxPaymentEventsConsumer,
  startAutoRejectWorker,
} from './infrastructure/adapters.js';
import { DrizzleCartStore, DrizzleOrderStore } from './infrastructure/drizzle-ordering.store.js';

const T = {
  clock: Symbol('ORDERING_CLOCK'),
  config: Symbol('ORDERING_CONFIG'),
  codes: Symbol('ORDERING_CODES'),
  catalog: Symbol('ORDERING_CATALOG'),
  geo: Symbol('ORDERING_GEO'),
  pricing: Symbol('ORDERING_PRICING'),
  payments: Symbol('ORDERING_PAYMENTS'),
  tracking: Symbol('ORDERING_TRACKING'),
  cartDeps: Symbol('ORDERING_CART_DEPS'),
  commandDeps: Symbol('ORDERING_COMMAND_DEPS'),
} as const;

const clock: Clock = { now: () => new Date(), uuid: () => randomUUID() };

/** Anti-corruption adapter: pricing quote → ordering totals. */
function pricingPort(p: PricingService): PricingPort {
  return {
    async quote(cmd) {
      const { quote, promo } = await p.quote(cmd);
      return {
        totals: {
          itemsSubtotal: quote.itemsSubtotal.minor,
          deliveryFee: quote.deliveryFee.minor,
          surgeFee: quote.surgeFee.minor,
          smallOrderFee: quote.smallOrderFee.minor,
          serviceFee: quote.serviceFee.minor,
          discount: quote.discount.minor,
          vat: quote.vat.minor,
          total: quote.total.minor,
        },
        promo,
      };
    },
  };
}

function trackingPort(t: LiveTrackingService): TrackingPort {
  return {
    publishOrderStatus: (id, s, at) => { t.publishOrderStatus(id, s, at); },
    startTrip: (r, o) => t.startTrip(r, o),
    endTrip: (r) => t.endTrip(r),
  };
}

const noRedeem = (): Promise<never> => Promise.reject(new Error('read-only order store'));

/**
 * Provider of the realtime {@link ORDER_ROOM_AUTHORIZER}: customer, assigned rider and vendor
 * members may join `order:<id>` (ops staff are allowed by the gateway first). Registered on the
 * realtime module by the composition root.
 */
export const orderRoomAuthorizerProvider: Provider = {
  provide: ORDER_ROOM_AUTHORIZER,
  inject: [DB],
  useFactory: (db: Db) =>
    new OrderRoomAccess({
      orders: new DrizzleOrderStore(db, noRedeem),
      catalog: buildCatalogService(db),
    }),
};

const providers: Provider[] = [
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
  { provide: T.clock, useValue: clock },
  {
    provide: T.config,
    inject: [ENV],
    useFactory: (env: Env): OrderingConfig => ({
      autoRejectMs: env.ORDERING_AUTO_REJECT_SECONDS * 1000,
      terms: {
        vendorCommissionBps: env.ORDERING_VENDOR_COMMISSION_BPS,
        riderDeliveryShareBps: env.ORDERING_RIDER_DELIVERY_SHARE_BPS,
      },
    }),
  },
  {
    provide: T.codes,
    inject: [ENV],
    useFactory: (env: Env) => new HmacOrderCodes(env.HASH_PEPPER),
  },
  {
    provide: T.catalog,
    inject: [CatalogService],
    useFactory: (c: CatalogService): CatalogPort => c,
  },
  { provide: T.geo, inject: [GeoService], useFactory: (g: GeoService): GeoPort => g },
  { provide: T.pricing, inject: [PricingService], useFactory: pricingPort },
  {
    provide: T.payments,
    inject: [PaymentsService],
    useFactory: (p: PaymentsService): PaymentsPort => p,
  },
  { provide: T.tracking, inject: [LIVE_TRACKING], useFactory: trackingPort },
  {
    provide: OWNERSHIP_CHECKER,
    inject: [T.catalog],
    useFactory: (c: CatalogPort) => ({
      canAccess: async (p: { userId: string }, vendorId: string) =>
        /^[0-9a-f-]{36}$/i.test(vendorId) && (await c.memberRole(vendorId, p.userId)) !== null,
    }),
  },
  {
    provide: DrizzleOrderStore,
    inject: [DB, TransactionalRedeemPromo],
    useFactory: (db: Db, r: TransactionalRedeemPromo) =>
      new DrizzleOrderStore(db, (tx, cmd) => r.execute(tx, cmd)),
  },
  { provide: DrizzleCartStore, inject: [DB], useFactory: (db: Db) => new DrizzleCartStore(db) },
  {
    provide: BullMqAutoRejectScheduler,
    inject: [ENV],
    useFactory: (env: Env) => new BullMqAutoRejectScheduler(env.REDIS_URL, env.BULLMQ_PREFIX),
  },
  {
    provide: OrderLifecycle,
    inject: [
      DrizzleOrderStore,
      T.payments,
      T.tracking,
      BullMqAutoRejectScheduler,
      LOGGER,
      T.config,
    ],
    useFactory: (
      store: DrizzleOrderStore,
      payments: PaymentsPort,
      tracking: TrackingPort,
      scheduler: BullMqAutoRejectScheduler,
      logger: Logger,
      config: OrderingConfig,
    ) => new OrderLifecycle({ store, payments, tracking, scheduler, clock, logger, config }),
  },
  {
    provide: T.cartDeps,
    inject: [DrizzleCartStore, T.catalog],
    useFactory: (carts: DrizzleCartStore, catalog: CatalogPort): CartDeps => ({
      carts,
      catalog,
      clock,
    }),
  },
  {
    provide: T.commandDeps,
    inject: [DrizzleOrderStore, OrderLifecycle, T.catalog, T.codes],
    useFactory: (
      orders: DrizzleOrderStore,
      lifecycle: OrderLifecycle,
      catalog: CatalogPort,
      codes: OrderCodes,
    ): OrderCommandDeps => ({
      orders,
      lifecycle,
      catalog,
      codes,
      clock,
    }),
  },
  { provide: ListCarts, inject: [T.cartDeps], useFactory: (d: CartDeps) => new ListCarts(d) },
  { provide: GetCart, inject: [T.cartDeps], useFactory: (d: CartDeps) => new GetCart(d) },
  {
    provide: AddCartLineUseCase,
    inject: [T.cartDeps],
    useFactory: (d: CartDeps) => new AddCartLineUseCase(d),
  },
  {
    provide: UpdateCartLineUseCase,
    inject: [T.cartDeps],
    useFactory: (d: CartDeps) => new UpdateCartLineUseCase(d),
  },
  {
    provide: RemoveCartLineUseCase,
    inject: [T.cartDeps],
    useFactory: (d: CartDeps) => new RemoveCartLineUseCase(d),
  },
  {
    provide: DeleteCartUseCase,
    inject: [DrizzleCartStore],
    useFactory: (c: DrizzleCartStore) => new DeleteCartUseCase(c),
  },
  {
    provide: Checkout,
    inject: [
      DrizzleOrderStore,
      DrizzleCartStore,
      T.catalog,
      T.geo,
      T.pricing,
      T.payments,
      OrderLifecycle,
      T.codes,
    ],
    useFactory: (
      orders: DrizzleOrderStore,
      carts: DrizzleCartStore,
      catalog: CatalogPort,
      geo: GeoPort,
      pricing: PricingPort,
      payments: PaymentsPort,
      lifecycle: OrderLifecycle,
      codes: OrderCodes,
    ) => new Checkout({ orders, carts, catalog, geo, pricing, payments, lifecycle, codes, clock }),
  },
  {
    provide: OrderQueries,
    inject: [DrizzleOrderStore, DrizzleCartStore, T.catalog, T.codes],
    useFactory: (
      orders: DrizzleOrderStore,
      carts: DrizzleCartStore,
      catalog: CatalogPort,
      codes: OrderCodes,
    ) => new OrderQueries({ orders, carts, catalog, codes, clock }),
  },
  {
    provide: VendorOrderActions,
    inject: [T.commandDeps],
    useFactory: (d: OrderCommandDeps) => new VendorOrderActions(d),
  },
  {
    provide: CancelOrderByCustomer,
    inject: [T.commandDeps],
    useFactory: (d: OrderCommandDeps) => new CancelOrderByCustomer(d),
  },
  {
    provide: CancelOrderByOps,
    inject: [T.commandDeps],
    useFactory: (d: OrderCommandDeps) => new CancelOrderByOps(d),
  },
  {
    provide: AutoRejectOrder,
    inject: [OrderLifecycle],
    useFactory: (l: OrderLifecycle) => new AutoRejectOrder(l),
  },
  {
    provide: HandlePaymentEvent,
    inject: [DrizzleOrderStore, OrderLifecycle, T.payments, LOGGER],
    useFactory: (
      orders: DrizzleOrderStore,
      lifecycle: OrderLifecycle,
      payments: PaymentsPort,
      logger: Logger,
    ) => new HandlePaymentEvent({ orders, lifecycle, payments, logger }),
  },
  {
    provide: OutboxPaymentEventsConsumer,
    inject: [PG_POOL, HandlePaymentEvent, LOGGER],
    useFactory: (pool: pg.Pool, h: HandlePaymentEvent, logger: Logger) =>
      new OutboxPaymentEventsConsumer(pool, h, logger),
  },
  {
    provide: ORDER_FULFILMENT_PORT,
    inject: [DrizzleOrderStore, OrderLifecycle, T.payments, T.codes, T.config],
    useFactory: (
      orders: DrizzleOrderStore,
      lifecycle: OrderLifecycle,
      payments: PaymentsPort,
      codes: OrderCodes,
      config: OrderingConfig,
    ) => new OrderFulfilmentService({ orders, lifecycle, payments, codes, config }),
  },
];

/**
 * Ordering bounded context: carts, checkout, the order state machine, vendor/ops actions and the
 * {@link ORDER_FULFILMENT_PORT} used by dispatch. Built with {@link OrderingModule.register} so it
 * shares the exact realtime module instance the app registers.
 */
@Module({})
export class OrderingModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private worker: Worker | undefined;

  /** Injected for lifecycle hooks. */
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly consumer: OutboxPaymentEventsConsumer,
    private readonly autoReject: AutoRejectOrder,
    private readonly scheduler: BullMqAutoRejectScheduler,
  ) {}

  /** @param realtime the realtime module the app registered (provides LIVE_TRACKING) */
  static register(realtime: DynamicModule | typeof Module | object): DynamicModule {
    return {
      module: OrderingModule,
      imports: [
        IdentityModule,
        PricingModule,
        GeoModule,
        CatalogModule,
        PaymentsModule,
        realtime as DynamicModule,
      ],
      controllers: [
        CartsController,
        OrdersController,
        VendorOrdersListController,
        VendorOrderActionsController,
        AdminOrdersController,
      ],
      providers,
      exports: [
        ORDER_FULFILMENT_PORT,
        AutoRejectOrder,
        HandlePaymentEvent,
        OutboxPaymentEventsConsumer,
      ],
    };
  }

  /** Starts the payment-event consumer and the auto-reject worker. */
  onApplicationBootstrap(): void {
    if (!this.env.ORDERING_JOBS_ENABLED) return;
    this.consumer.start();
    this.worker = startAutoRejectWorker(
      this.env.REDIS_URL,
      this.env.BULLMQ_PREFIX,
      this.autoReject,
      this.logger,
    );
  }

  /** Stops background work. */
  async onApplicationShutdown(): Promise<void> {
    this.consumer.stop();
    await this.worker?.close();
    await this.scheduler.close();
  }
}
