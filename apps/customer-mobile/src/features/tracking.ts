import type { OrderStatus } from '@delyva/contracts';
import type { MessageKey } from '../i18n';

/** The five customer-facing tracking steps. */
export const TRACKING_STEPS = [
  'track.step.placed',
  'track.step.preparing',
  'track.step.pickup',
  'track.step.onTheWay',
  'track.step.delivered',
] as const satisfies readonly MessageKey[];

const STEP_OF: Partial<Record<OrderStatus, number>> = {
  PENDING_PAYMENT: 0,
  PLACED: 0,
  VENDOR_ACCEPTED: 1,
  PREPARING: 1,
  READY_FOR_PICKUP: 2,
  RIDER_ASSIGNED: 2,
  RIDER_AT_VENDOR: 2,
  PICKED_UP: 3,
  RIDER_AT_CUSTOMER: 3,
  DELIVERED: 4,
};

/** Step index for a status, or -1 for side exits (rejected, cancelled, refunds). */
export function trackingStep(status: OrderStatus): number {
  return STEP_OF[status] ?? -1;
}

/** Statuses where the order is still moving (shown under "Active"). */
export function isActiveOrder(status: OrderStatus): boolean {
  return trackingStep(status) >= 0 && status !== 'DELIVERED';
}

/** Customer cancel is allowed only before PREPARING (ARCHITECTURE state machine). */
export function canCustomerCancel(status: OrderStatus): boolean {
  return status === 'PENDING_PAYMENT' || status === 'PLACED' || status === 'VENDOR_ACCEPTED';
}

/** The delivery OTP is only worth showing once a rider is on the way. */
export function showsDeliveryOtp(status: OrderStatus): boolean {
  const step = trackingStep(status);
  return step >= 2 && step < 4;
}

/** i18n key for a status line. */
export function statusKey(status: OrderStatus): MessageKey {
  return `track.status.${status}`;
}
