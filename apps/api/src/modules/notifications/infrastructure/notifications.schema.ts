import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * In-app inbox (notifications context). `user_id` references identity's users by value only
 * (no cross-context FK) so the context can be extracted later.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    template: text('template').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').$type<Record<string, string>>().notNull().default({}),
    dedupeKey: text('dedupe_key').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notifications_user_dedupe_uq').on(t.userId, t.dedupeKey),
    index('notifications_user_created_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
    index('notifications_user_unread_idx')
      .on(t.userId)
      .where(sql`read_at IS NULL`),
  ],
);

/** Expo push tokens bound to (user, device id from the access token). */
export const pushDevices = pgTable(
  'push_devices',
  {
    userId: uuid('user_id').notNull(),
    deviceId: text('device_id').notNull(),
    pushToken: text('push_token').notNull(),
    platform: text('platform').notNull(),
    locale: text('locale').notNull().default('en'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.deviceId] }),
    uniqueIndex('push_devices_token_uq').on(t.pushToken),
  ],
);

/** Preference overrides (absent row = default). */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id').notNull(),
    category: text('category').notNull(),
    channel: text('channel').notNull(),
    enabled: boolean('enabled').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category, t.channel] })],
);

/** Outbox events this context has consumed (idempotent consumer receipts). */
export const notificationEventReceipts = pgTable('notification_event_receipts', {
  eventId: uuid('event_id').primaryKey(),
  eventType: text('event_type').notNull(),
  outcome: text('outcome').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});
