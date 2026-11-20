import type { NotificationTemplateId } from '@delyva/contracts';

/** Request to notify one user, derived from a domain event. */
export interface NotifyCommand {
  readonly userId: string;
  readonly template: NotificationTemplateId;
  readonly params: Readonly<Record<string, string>>;
  /** Deep-link data for the client (ids only, never PII). */
  readonly data: Readonly<Record<string, string>>;
  /** Source event id; makes delivery idempotent per (event, user). */
  readonly sourceEventId: string;
}

/** Minimal order-event payload the ordering context is expected to emit. */
export interface OrderEventPayload {
  readonly orderId: string;
  readonly customerId: string;
  /** Short human reference shown to customers (falls back to the id prefix). */
  readonly orderRef?: string;
}

/**
 * Ordering events (placeholders by name until the ordering context ships them) → templates.
 * Unlisted ordering events produce no notification.
 */
export const ORDER_EVENT_TEMPLATES: Readonly<Record<string, NotificationTemplateId>> = {
  'ordering.order.placed': 'order.placed',
  'ordering.order.vendor_accepted': 'order.vendor_accepted',
  'ordering.order.rider_assigned': 'order.rider_assigned',
  'ordering.order.picked_up': 'order.picked_up',
  'ordering.order.delivered': 'order.delivered',
  'ordering.order.cancelled_by_customer': 'order.cancelled',
  'ordering.order.cancelled_by_ops': 'order.cancelled',
  'ordering.order.vendor_rejected': 'order.cancelled',
};

/** Event types this context consumes. */
export const CONSUMED_EVENT_TYPES: readonly string[] = [
  'identity.user.registered',
  ...Object.keys(ORDER_EVENT_TEMPLATES),
];

/** Welcome notification for a newly registered user. */
export function welcomeCommand(eventId: string, userId: string): NotifyCommand {
  return { userId, template: 'account.welcome', params: {}, data: {}, sourceEventId: eventId };
}

/** Customer notification for an order event, or null when the event type is not mapped. */
export function orderCommand(
  eventId: string,
  type: string,
  payload: OrderEventPayload,
): NotifyCommand | null {
  const template = ORDER_EVENT_TEMPLATES[type];
  if (!template) return null;
  return {
    userId: payload.customerId,
    template,
    params: { orderRef: payload.orderRef ?? payload.orderId.slice(0, 8).toUpperCase() },
    data: { orderId: payload.orderId },
    sourceEventId: eventId,
  };
}
