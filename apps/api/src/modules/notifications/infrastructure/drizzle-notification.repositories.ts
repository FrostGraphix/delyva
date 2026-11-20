import type {
  InboxNotification,
  NotificationLocale,
  NotificationPreference,
  NotificationTemplateId,
} from '@delyva/contracts';
import { and, count, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import type {
  DeviceRepository,
  InboxRepository,
  NewInboxItem,
  PreferenceRepository,
  PushDevice,
  RecipientDirectory,
} from '../application/ports.js';
import { notificationPreferences, notifications, pushDevices } from './notifications.schema.js';

/** Drizzle adapter for {@link InboxRepository}. Every query is scoped by `user_id` (no IDOR). */
export class DrizzleInboxRepository implements InboxRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async insert(item: NewInboxItem): Promise<boolean> {
    const rows = await this.db
      .insert(notifications)
      .values({ ...item, data: { ...item.data } })
      .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
      .returning({ id: notifications.id });
    return rows.length > 0;
  }

  /** @inheritdoc */
  async list(
    userId: string,
    opts: { limit: number; before: { createdAt: Date; id: string } | null; unreadOnly: boolean },
  ): Promise<InboxNotification[]> {
    const { before } = opts;
    const rows = await this.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          opts.unreadOnly ? isNull(notifications.readAt) : undefined,
          before
            ? or(
                lt(notifications.createdAt, before.createdAt),
                and(eq(notifications.createdAt, before.createdAt), lt(notifications.id, before.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(opts.limit);
    return rows.map((r) => ({
      id: r.id,
      template: r.template as NotificationTemplateId,
      title: r.title,
      body: r.body,
      data: r.data,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** @inheritdoc */
  async unreadCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.n ?? 0;
  }

  /** @inheritdoc */
  async markRead(userId: string, id: string, at: Date): Promise<boolean> {
    const rows = await this.db
      .update(notifications)
      .set({ readAt: sql`COALESCE(${notifications.readAt}, ${at.toISOString()}::timestamptz)` })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning({ id: notifications.id });
    return rows.length > 0;
  }
}

/** Drizzle adapter for {@link DeviceRepository}. */
export class DrizzleDeviceRepository implements DeviceRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async upsert(d: PushDevice): Promise<void> {
    await this.db.transaction(async (tx) => {
      // A token re-registered by another user/device is detached from its previous owner.
      await tx
        .delete(pushDevices)
        .where(
          and(
            eq(pushDevices.pushToken, d.pushToken),
            or(
              sql`${pushDevices.userId} <> ${d.userId}`,
              sql`${pushDevices.deviceId} <> ${d.deviceId}`,
            ),
          ),
        );
      await tx
        .insert(pushDevices)
        .values({ ...d, createdAt: d.updatedAt })
        .onConflictDoUpdate({
          target: [pushDevices.userId, pushDevices.deviceId],
          set: {
            pushToken: d.pushToken,
            platform: d.platform,
            locale: d.locale,
            updatedAt: d.updatedAt,
            disabledAt: null,
          },
        });
    });
  }

  /** @inheritdoc */
  async activeFor(userId: string): Promise<PushDevice[]> {
    const rows = await this.db
      .select()
      .from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), isNull(pushDevices.disabledAt)))
      .orderBy(desc(pushDevices.updatedAt));
    return rows.map((r) => ({
      userId: r.userId,
      deviceId: r.deviceId,
      pushToken: r.pushToken,
      platform: r.platform === 'ios' ? 'ios' : 'android',
      locale: r.locale as NotificationLocale,
      updatedAt: r.updatedAt,
    }));
  }
}

/** Drizzle adapter for {@link PreferenceRepository}. */
export class DrizzlePreferenceRepository implements PreferenceRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async get(userId: string): Promise<NotificationPreference[]> {
    const rows = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
    return rows.map((r) => ({
      category: r.category as NotificationPreference['category'],
      channel: r.channel as NotificationPreference['channel'],
      enabled: r.enabled,
    }));
  }

  /** @inheritdoc */
  async put(userId: string, prefs: readonly NotificationPreference[]): Promise<void> {
    if (prefs.length === 0) return;
    await this.db
      .insert(notificationPreferences)
      .values(prefs.map((p) => ({ userId, ...p })))
      .onConflictDoUpdate({
        target: [
          notificationPreferences.userId,
          notificationPreferences.category,
          notificationPreferences.channel,
        ],
        set: { enabled: sql`excluded.enabled`, updatedAt: sql`now()` },
      });
  }
}

/**
 * Reads the phone from identity's `users` table (read-only).
 * DEBT(notifications): cross-context table read — identity exposes no directory service yet — replace with an identity `UserDirectory` port.
 */
export class SqlRecipientDirectory implements RecipientDirectory {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async phoneOf(userId: string): Promise<string | null> {
    const result = await this.db.execute<{ phone: string }>(
      sql`SELECT phone FROM users WHERE id = ${userId}`,
    );
    return result.rows[0]?.phone ?? null;
  }
}
