import { randomUUID } from 'node:crypto';
import {
  Inject,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type pg from 'pg';
import type { Logger } from 'pino';
import { ENV, type Env } from '../../shared/config/env.js';
import { DB, type Db, PG_POOL } from '../../shared/database/database.js';
import { LOGGER } from '../../shared/logging/logger.js';
import { IdentityModule } from '../identity/identity.module.js';
import { NotificationsController } from './api/notifications.controller.js';
import {
  GetPreferences,
  RegisterDevice,
  UpdatePreferences,
} from './application/device-and-preferences.use-cases.js';
import { HandleDomainEvent } from './application/handle-domain-event.use-case.js';
import { ListInbox, MarkNotificationRead } from './application/inbox.use-cases.js';
import { NotifyUser } from './application/notify-user.use-case.js';
import type { Clock } from './application/ports.js';
import { BullMqDeliveryQueue } from './infrastructure/bullmq-delivery.queue.js';
import {
  DrizzleDeviceRepository,
  DrizzleInboxRepository,
  DrizzlePreferenceRepository,
  SqlRecipientDirectory,
} from './infrastructure/drizzle-notification.repositories.js';
import { OutboxNotificationConsumer } from './infrastructure/outbox-notification.consumer.js';

const CLOCK = Symbol('NOTIFICATIONS_CLOCK');
const systemClock: Clock = { now: () => new Date(), uuid: () => randomUUID() };

/** Notifications bounded context: templates, preferences, inbox, devices, event consumer. */
@Module({
  imports: [IdentityModule],
  controllers: [NotificationsController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
    {
      provide: DrizzleInboxRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleInboxRepository(db),
    },
    {
      provide: DrizzleDeviceRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleDeviceRepository(db),
    },
    {
      provide: DrizzlePreferenceRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzlePreferenceRepository(db),
    },
    {
      provide: SqlRecipientDirectory,
      inject: [DB],
      useFactory: (db: Db) => new SqlRecipientDirectory(db),
    },
    {
      provide: BullMqDeliveryQueue,
      inject: [ENV],
      useFactory: (env: Env) => new BullMqDeliveryQueue(env.REDIS_URL, env.BULLMQ_PREFIX),
    },
    {
      provide: NotifyUser,
      inject: [
        DrizzleInboxRepository,
        DrizzleDeviceRepository,
        DrizzlePreferenceRepository,
        SqlRecipientDirectory,
        BullMqDeliveryQueue,
        CLOCK,
      ],
      useFactory: (
        inbox: DrizzleInboxRepository,
        devices: DrizzleDeviceRepository,
        preferences: DrizzlePreferenceRepository,
        directory: SqlRecipientDirectory,
        queue: BullMqDeliveryQueue,
        clock: Clock,
      ) => new NotifyUser({ inbox, devices, preferences, directory, queue, clock }),
    },
    {
      provide: HandleDomainEvent,
      inject: [NotifyUser],
      useFactory: (n: NotifyUser) => new HandleDomainEvent(n),
    },
    {
      provide: OutboxNotificationConsumer,
      inject: [PG_POOL, HandleDomainEvent, LOGGER],
      useFactory: (pool: pg.Pool, h: HandleDomainEvent, logger: Logger) =>
        new OutboxNotificationConsumer(pool, h, logger),
    },
    {
      provide: ListInbox,
      inject: [DrizzleInboxRepository],
      useFactory: (r: DrizzleInboxRepository) => new ListInbox(r),
    },
    {
      provide: MarkNotificationRead,
      inject: [DrizzleInboxRepository, CLOCK],
      useFactory: (r: DrizzleInboxRepository, c: Clock) => new MarkNotificationRead(r, c),
    },
    {
      provide: RegisterDevice,
      inject: [DrizzleDeviceRepository, CLOCK],
      useFactory: (r: DrizzleDeviceRepository, c: Clock) => new RegisterDevice(r, c),
    },
    {
      provide: GetPreferences,
      inject: [DrizzlePreferenceRepository],
      useFactory: (r: DrizzlePreferenceRepository) => new GetPreferences(r),
    },
    {
      provide: UpdatePreferences,
      inject: [DrizzlePreferenceRepository],
      useFactory: (r: DrizzlePreferenceRepository) => new UpdatePreferences(r),
    },
  ],
  exports: [NotifyUser],
})
export class NotificationsModule implements OnApplicationBootstrap, OnApplicationShutdown {
  /** @param consumer outbox consumer @param queue delivery queue @param env config */
  constructor(
    private readonly consumer: OutboxNotificationConsumer,
    private readonly queue: BullMqDeliveryQueue,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Starts the outbox consumer unless disabled. */
  onApplicationBootstrap(): void {
    if (this.env.NOTIFICATIONS_CONSUMER_ENABLED) this.consumer.start();
  }

  /** Stops polling and closes the queue connection. */
  async onApplicationShutdown(): Promise<void> {
    this.consumer.stop();
    await this.queue.close();
  }
}
