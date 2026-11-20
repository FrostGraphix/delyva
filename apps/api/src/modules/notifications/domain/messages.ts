import type { NotificationLocale } from '@delyva/contracts';

/** Flat i18n dictionary: `notifications.<templateId>.<title|body|text>` → copy with `{{param}}` slots. */
export type MessageCatalogue = Readonly<Record<string, string>>;

const en: MessageCatalogue = {
  'notifications.account.welcome.title': 'Welcome to Delyva',
  'notifications.account.welcome.body':
    'Your account is ready. Set your address to see vendors that deliver to you.',
  'notifications.order.placed.title': 'Order placed',
  'notifications.order.placed.body': 'We have sent order {{orderRef}} to the vendor.',
  'notifications.order.vendor_accepted.title': 'Order accepted',
  'notifications.order.vendor_accepted.body': 'The vendor is preparing order {{orderRef}}.',
  'notifications.order.rider_assigned.title': 'Rider on the way',
  'notifications.order.rider_assigned.body':
    'A rider has been assigned to order {{orderRef}}. Track them live in the app.',
  'notifications.order.rider_assigned.text':
    'Delyva: a rider is on the way for order {{orderRef}}.',
  'notifications.order.picked_up.title': 'Order picked up',
  'notifications.order.picked_up.body': 'Your rider has picked up order {{orderRef}}.',
  'notifications.order.delivered.title': 'Delivered',
  'notifications.order.delivered.body': 'Order {{orderRef}} has been delivered. Enjoy!',
  'notifications.order.cancelled.title': 'Order cancelled',
  'notifications.order.cancelled.body':
    'Order {{orderRef}} was cancelled. Any payment will be refunded.',
  'notifications.order.cancelled.text':
    'Delyva: order {{orderRef}} was cancelled. Any payment will be refunded.',
  'notifications.rider.dispatch_offer.title': 'New delivery job',
  'notifications.rider.dispatch_offer.body':
    'A pickup is waiting near you. Open Delyva to accept within {{seconds}} seconds.',
};

/**
 * Message catalogues per locale. Only English is translated today; Pidgin, Yoruba, Hausa and
 * Igbo fall back to English key by key until their translations land.
 */
export const MESSAGES: Readonly<Record<NotificationLocale, MessageCatalogue>> = {
  en,
  pcm: {},
  yo: {},
  ha: {},
  ig: {},
};
