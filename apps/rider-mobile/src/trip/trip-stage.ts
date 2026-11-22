import type { TripStatus } from '@delyva/contracts';
import type { TripActionSegment } from '@delyva/sdk';
import type { MessageKey } from '../i18n';

/** What the trip screen shows for a status. */
export interface TripStage {
  readonly title: MessageKey;
  /** Where the maps hand-off points. */
  readonly target: 'pickup' | 'dropoff' | null;
  /** Primary action for this stage. */
  readonly action: TripActionSegment | null;
  readonly actionLabel: MessageKey | null;
  /** Code the rider must type before the action, if any. */
  readonly code: 'pickup' | 'delivery' | null;
  /** 1-based step of the 5-step progress bar. */
  readonly step: number;
}

const STAGES: Record<TripStatus, TripStage> = {
  assigned: {
    title: 'trip.toStore',
    target: 'pickup',
    action: 'arrived-at-vendor',
    actionLabel: 'trip.confirmArrival',
    code: 'pickup',
    step: 1,
  },
  at_vendor: {
    title: 'trip.atStore',
    target: 'pickup',
    action: 'picked-up',
    actionLabel: 'trip.pickedUp',
    code: null,
    step: 2,
  },
  picked_up: {
    title: 'trip.toCustomer',
    target: 'dropoff',
    action: 'arrived-at-customer',
    actionLabel: 'trip.arrivedCustomer',
    code: null,
    step: 3,
  },
  at_customer: {
    title: 'trip.atCustomer',
    target: 'dropoff',
    action: 'delivered',
    actionLabel: 'trip.completeDelivery',
    code: 'delivery',
    step: 4,
  },
  delivered: {
    title: 'delivered.title',
    target: null,
    action: null,
    actionLabel: null,
    code: null,
    step: 5,
  },
  undeliverable: {
    title: 'delivered.undeliverableTitle',
    target: null,
    action: null,
    actionLabel: null,
    code: null,
    step: 5,
  },
};

/** Stage for a trip status. */
export function stageFor(status: TripStatus): TripStage {
  return STAGES[status];
}

/** Status the trip moves to after an action (used for optimistic offline progress). */
export function nextStatus(action: TripActionSegment): TripStatus {
  const map: Record<TripActionSegment, TripStatus> = {
    'arrived-at-vendor': 'at_vendor',
    'picked-up': 'picked_up',
    'arrived-at-customer': 'at_customer',
    delivered: 'delivered',
    undeliverable: 'undeliverable',
  };
  return map[action];
}

/** True once the trip can no longer change. */
export function isFinal(status: TripStatus): boolean {
  return status === 'delivered' || status === 'undeliverable';
}
