import type {
  NotificationCategory,
  NotificationChannel,
  NotificationLocale,
  NotificationTemplateId,
} from '@delyva/contracts';
import { MESSAGES } from './messages.js';

/** Static definition of a notification template. Copy lives in the i18n catalogue, not here. */
export interface TemplateDefinition {
  readonly id: NotificationTemplateId;
  readonly category: NotificationCategory;
  /** Channels this template may use, in priority order. */
  readonly channels: readonly NotificationChannel[];
  /** Mandatory templates ignore user opt-outs (security/legal notices only). */
  readonly mandatory: boolean;
  /** Placeholders the copy requires. */
  readonly params: readonly string[];
}

const order = (
  id: NotificationTemplateId,
  channels: readonly NotificationChannel[] = ['push', 'in_app'],
): TemplateDefinition => ({
  id,
  category: 'order_updates',
  channels,
  mandatory: false,
  params: ['orderRef'],
});

/** Template catalogue. */
export const TEMPLATES: Readonly<Record<NotificationTemplateId, TemplateDefinition>> = {
  'account.welcome': {
    id: 'account.welcome',
    category: 'account',
    channels: ['push', 'in_app'],
    mandatory: false,
    params: [],
  },
  'order.placed': order('order.placed'),
  'order.vendor_accepted': order('order.vendor_accepted'),
  'order.rider_assigned': order('order.rider_assigned', ['push', 'in_app', 'sms']),
  'order.picked_up': order('order.picked_up'),
  'order.delivered': order('order.delivered'),
  'order.cancelled': order('order.cancelled', ['push', 'in_app', 'sms']),
};

/** Rendered copy for one locale. */
export interface RenderedNotification {
  readonly title: string;
  readonly body: string;
  /** Short plain text for SMS/WhatsApp (falls back to the body). */
  readonly text: string;
}

/** Thrown when copy or a required placeholder is missing (a programming error, not user input). */
export class TemplateRenderError extends Error {
  /** @param message description (never contains param values) */
  constructor(message: string) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

/** i18n key for a template part. */
export const messageKey = (id: NotificationTemplateId, part: 'title' | 'body' | 'text'): string =>
  `notifications.${id}.${part}`;

function lookup(locale: NotificationLocale, key: string): string | undefined {
  return MESSAGES[locale][key] ?? MESSAGES.en[key];
}

function interpolate(template: string, params: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new TemplateRenderError(`missing param "${name}"`);
    return value;
  });
}

/**
 * Renders a template in the requested locale, falling back to English per key.
 * @throws TemplateRenderError when a required param or the English copy is missing
 */
export function renderTemplate(
  id: NotificationTemplateId,
  locale: NotificationLocale,
  params: Readonly<Record<string, string>>,
): RenderedNotification {
  for (const name of TEMPLATES[id].params) {
    if (params[name] === undefined) throw new TemplateRenderError(`missing param "${name}"`);
  }
  const title = lookup(locale, messageKey(id, 'title'));
  const body = lookup(locale, messageKey(id, 'body'));
  if (title === undefined || body === undefined) {
    throw new TemplateRenderError(`no copy for template "${id}"`);
  }
  const text = lookup(locale, messageKey(id, 'text')) ?? body;
  return {
    title: interpolate(title, params),
    body: interpolate(body, params),
    text: interpolate(text, params),
  };
}
