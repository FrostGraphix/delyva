import type {
  NotificationCategory,
  NotificationChannel,
  NotificationPreference,
} from '@delyva/contracts';
import type { TemplateDefinition } from './templates.js';

const CATEGORIES: readonly NotificationCategory[] = ['account', 'order_updates', 'promotions'];
const CHANNELS: readonly NotificationChannel[] = ['push', 'sms', 'whatsapp', 'in_app'];

/**
 * Default switches. Promotions are opt-in except the in-app inbox (NDPA consent);
 * SMS/WhatsApp cost money per message so they are opt-in too.
 */
const DEFAULT_ON: Readonly<Record<NotificationCategory, readonly NotificationChannel[]>> = {
  account: ['push', 'in_app'],
  order_updates: ['push', 'in_app'],
  promotions: ['in_app'],
};

/** Merges stored overrides over the defaults into the full category × channel matrix. */
export function effectivePreferences(
  stored: readonly NotificationPreference[],
): NotificationPreference[] {
  const overrides = new Map(stored.map((p) => [`${p.category}:${p.channel}`, p.enabled]));
  return CATEGORIES.flatMap((category) =>
    CHANNELS.map((channel) => ({
      category,
      channel,
      enabled: overrides.get(`${category}:${channel}`) ?? DEFAULT_ON[category].includes(channel),
    })),
  );
}

/**
 * Channels a template should be delivered on for a user: the template's channels filtered by the
 * user's preferences, unless the template is mandatory.
 */
export function selectChannels(
  template: TemplateDefinition,
  stored: readonly NotificationPreference[],
): NotificationChannel[] {
  if (template.mandatory) return [...template.channels];
  const enabled = new Set(
    effectivePreferences(stored)
      .filter((p) => p.category === template.category && p.enabled)
      .map((p) => p.channel),
  );
  return template.channels.filter((c) => enabled.has(c));
}
