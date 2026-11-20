import { DispatchError } from './dispatch-errors.js';

/** Trip status. */
export type TripStatus =
  'assigned' | 'at_vendor' | 'picked_up' | 'at_customer' | 'delivered' | 'undeliverable';

/** Rider trip action. */
export type TripActionKind =
  'arrived_at_vendor' | 'picked_up' | 'arrived_at_customer' | 'delivered' | 'undeliverable';

/** Trip statuses that hold the rider and the order (no new assignment allowed). */
export const ACTIVE_TRIP_STATUSES: readonly TripStatus[] = [
  'assigned',
  'at_vendor',
  'picked_up',
  'at_customer',
];

const HAPPY: readonly TripStatus[] = [...ACTIVE_TRIP_STATUSES, 'delivered'];

interface Transition {
  readonly from: readonly TripStatus[];
  readonly to: TripStatus;
  /** Which point the rider must be near (GPS sanity check). */
  readonly near: 'pickup' | 'dropoff';
}

/** Explicit transition table; any other move is rejected. */
export const TRIP_TRANSITIONS: Readonly<Record<TripActionKind, Transition>> = {
  arrived_at_vendor: { from: ['assigned'], to: 'at_vendor', near: 'pickup' },
  picked_up: { from: ['at_vendor'], to: 'picked_up', near: 'pickup' },
  arrived_at_customer: { from: ['picked_up'], to: 'at_customer', near: 'dropoff' },
  delivered: { from: ['at_customer'], to: 'delivered', near: 'dropoff' },
  undeliverable: { from: ['picked_up', 'at_customer'], to: 'undeliverable', near: 'dropoff' },
};

/** Result of planning a trip action. */
export type TripPlan =
  | { readonly kind: 'apply'; readonly to: TripStatus; readonly near: 'pickup' | 'dropoff' }
  | { readonly kind: 'already_applied' };

/** True when the trip no longer holds the rider. */
export const isTerminalTrip = (s: TripStatus): boolean => !ACTIVE_TRIP_STATUSES.includes(s);

/**
 * Plans an action. Replays of an action the trip has already passed (offline queue replays)
 * are `already_applied` so they succeed without side effects.
 * @throws DispatchError conflict for any other transition
 */
export function planTripAction(current: TripStatus, action: TripActionKind): TripPlan {
  const t = TRIP_TRANSITIONS[action];
  if (t.from.includes(current)) return { kind: 'apply', to: t.to, near: t.near };
  if (current === t.to) return { kind: 'already_applied' };
  const passed =
    t.to !== 'undeliverable' &&
    HAPPY.includes(current) &&
    HAPPY.indexOf(current) > HAPPY.indexOf(t.to);
  if (passed) return { kind: 'already_applied' };
  throw new DispatchError('conflict', `Cannot ${action.replaceAll('_', ' ')} from ${current}.`);
}
