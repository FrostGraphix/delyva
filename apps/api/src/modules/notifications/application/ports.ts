import type {
  InboxNotification,
  NotificationJob,
  NotificationLocale,
  NotificationPreference,
  NotificationTemplateId,
} from '@delyva/contracts';

/** New inbox row (rendered). */
export interface NewInboxItem {
  readonly id: string;
  readonly userId: string;
  readonly template: NotificationTemplateId;
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string>>;
  /** `<sourceEventId>` — unique per user so replays never duplicate. */
  readonly dedupeKey: string;
  readonly createdAt: Date;
}

/** Inbox persistence. */
export interface InboxRepository {
  /** Inserts unless (userId, dedupeKey) exists; returns false on duplicate. */
  insert(item: NewInboxItem): Promise<boolean>;
  /** Newest-first page strictly older than the cursor position. */
  list(
    userId: string,
    opts: {
      limit: number;
      before: { createdAt: Date; id: string } | null;
      unreadOnly: boolean;
    },
  ): Promise<InboxNotification[]>;
  /** Unread count for a user. */
  unreadCount(userId: string): Promise<number>;
  /** Marks read if owned by the user; returns false when no such item for that user. */
  markRead(userId: string, id: string, at: Date): Promise<boolean>;
}

/** Registered push device. */
export interface PushDevice {
  readonly userId: string;
  readonly deviceId: string;
  readonly pushToken: string;
  readonly platform: 'ios' | 'android';
  readonly locale: NotificationLocale;
  readonly updatedAt: Date;
}

/** Device persistence. */
export interface DeviceRepository {
  /** Upserts by (userId, deviceId); a token moving to a new user/device is detached from the old one. */
  upsert(device: PushDevice): Promise<void>;
  /** Active devices of a user (most recent first). */
  activeFor(userId: string): Promise<PushDevice[]>;
}

/** Preference persistence (overrides only). */
export interface PreferenceRepository {
  /** Stored overrides for a user. */
  get(userId: string): Promise<NotificationPreference[]>;
  /** Upserts overrides. */
  put(userId: string, prefs: readonly NotificationPreference[]): Promise<void>;
}

/** Looks up contact data owned by the identity context. */
export interface RecipientDirectory {
  /** E.164 phone of the user, or null. Never log the result. */
  phoneOf(userId: string): Promise<string | null>;
}

/** Enqueues delivery jobs (BullMQ). */
export interface DeliveryQueue {
  /** Adds a job; `jobId` is deterministic so duplicate enqueues are no-ops. */
  enqueue(jobId: string, job: NotificationJob): Promise<void>;
}

/** Clock and id source. */
export interface Clock {
  /** Current time. */
  now(): Date;
  /** New UUID v4. */
  uuid(): string;
}
