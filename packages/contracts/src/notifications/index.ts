import { z } from 'zod';

/** Locales the template catalogue is structured for. English ships first; others fall back to `en`. */
export const NotificationLocaleSchema = z.enum(['en', 'pcm', 'yo', 'ha', 'ig']);
/** Supported notification locale. */
export type NotificationLocale = z.infer<typeof NotificationLocaleSchema>;

/** Delivery channels. `in_app` is the inbox; the others go through BullMQ workers. */
export const NotificationChannelSchema = z.enum(['push', 'sms', 'whatsapp', 'in_app']);
/** Delivery channel. */
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

/** Preference categories a user can switch channels on/off for. */
export const NotificationCategorySchema = z.enum(['account', 'order_updates', 'promotions']);
/** Preference category. */
export type NotificationCategory = z.infer<typeof NotificationCategorySchema>;

/** Template identifiers (each maps to i18n keys `notifications.<id>.title|body`). */
export const NotificationTemplateIdSchema = z.enum([
  'account.welcome',
  'order.placed',
  'order.vendor_accepted',
  'order.rider_assigned',
  'order.picked_up',
  'order.delivered',
  'order.cancelled',
  'rider.dispatch_offer',
]);
/** Template identifier. */
export type NotificationTemplateId = z.infer<typeof NotificationTemplateIdSchema>;

/** Expo push token format (`ExponentPushToken[...]` or `ExpoPushToken[...]`). */
export const ExpoPushTokenSchema = z
  .string()
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$/, 'Must be an Expo push token');

/** POST /v1/devices body. The device id is taken from the access token (`did`), never the body. */
export const RegisterDeviceSchema = z.strictObject({
  pushToken: ExpoPushTokenSchema,
  platform: z.enum(['ios', 'android']),
  locale: NotificationLocaleSchema.default('en'),
});
/** POST /v1/devices body (input). */
export type RegisterDevice = z.input<typeof RegisterDeviceSchema>;

/** POST /v1/devices 200 response. */
export const DeviceRegistrationSchema = z.strictObject({
  deviceId: z.string(),
  platform: z.enum(['ios', 'android']),
  locale: NotificationLocaleSchema,
  registeredAt: z.iso.datetime(),
});
/** POST /v1/devices response. */
export type DeviceRegistration = z.infer<typeof DeviceRegistrationSchema>;

/** One in-app inbox item (already rendered in the user's locale). */
export const InboxNotificationSchema = z.strictObject({
  id: z.uuid(),
  template: NotificationTemplateIdSchema,
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.string()),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
/** In-app inbox item. */
export type InboxNotification = z.infer<typeof InboxNotificationSchema>;

/** GET /v1/notifications query (cursor = `createdAt|id` of the last item seen). */
export const ListNotificationsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(100).optional(),
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
/** GET /v1/notifications query (input). */
export type ListNotificationsQuery = z.input<typeof ListNotificationsQuerySchema>;

/** GET /v1/notifications response. */
export const NotificationPageSchema = z.strictObject({
  items: z.array(InboxNotificationSchema),
  nextCursor: z.string().nullable(),
  unreadCount: z.number().int().nonnegative(),
});
/** GET /v1/notifications response. */
export type NotificationPage = z.infer<typeof NotificationPageSchema>;

/** One channel switch for a category. */
export const NotificationPreferenceSchema = z.strictObject({
  category: NotificationCategorySchema,
  channel: NotificationChannelSchema,
  enabled: z.boolean(),
});
/** Channel switch for a category. */
export type NotificationPreference = z.infer<typeof NotificationPreferenceSchema>;

/** GET/PUT /v1/notifications/preferences body and response. */
export const NotificationPreferencesSchema = z.strictObject({
  preferences: z.array(NotificationPreferenceSchema).max(40),
});
/** Preferences document. */
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

/** BullMQ queue names shared by the API (producer) and workers (consumer). */
export const NOTIFICATION_QUEUES = {
  delivery: 'notifications',
  deadLetter: 'notifications-dlq',
} as const;

/** Rendered push job. Contains the minimum needed to deliver; no phone numbers. */
export const PushJobSchema = z.strictObject({
  kind: z.literal('push'),
  notificationId: z.uuid(),
  userId: z.uuid(),
  tokens: z.array(ExpoPushTokenSchema).min(1).max(20),
  title: z.string().max(200),
  body: z.string().max(1000),
  data: z.record(z.string(), z.string()),
});

/**
 * Rendered SMS / WhatsApp job.
 * DEBT(notifications): the phone (PII) sits in Redis job data — workers have no DB access yet — resolve the phone in the worker via an identity lookup or encrypt the field.
 */
export const TextJobSchema = z.strictObject({
  kind: z.enum(['sms', 'whatsapp']),
  notificationId: z.uuid(),
  userId: z.uuid(),
  phone: z.string().regex(/^\+\d{8,15}$/),
  text: z.string().max(640),
});

/** Payload of a job on the `notifications` delivery queue. */
export const NotificationJobSchema = z.discriminatedUnion('kind', [PushJobSchema, TextJobSchema]);
/** Delivery job payload. */
export type NotificationJob = z.infer<typeof NotificationJobSchema>;

/** Payload of a job moved to the dead-letter queue. */
export const DeadLetterJobSchema = z.strictObject({
  queue: z.string(),
  jobId: z.string(),
  name: z.string(),
  attemptsMade: z.number().int().nonnegative(),
  failedReason: z.string(),
  data: z.unknown(),
  failedAt: z.iso.datetime(),
});
/** Dead-letter record. */
export type DeadLetterJob = z.infer<typeof DeadLetterJobSchema>;
