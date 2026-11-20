import { DispatchError } from '../domain/dispatch-errors.js';
import type { OrderFulfilmentPort } from './ordering-contract.temp.js';
import type {
  Clock,
  DispatchEvent,
  DispatchRequest,
  DispatchStore,
  TripRecord,
  Tracking,
} from './ports.js';

/** How the trip came about. */
export interface AssignmentSource {
  readonly offerId: string | null;
  readonly assignedBy: string | null;
  readonly reason: string | null;
}

/** Shared collaborators for assignment. */
export interface AssignDeps {
  readonly store: DispatchStore;
  readonly port: OrderFulfilmentPort;
  readonly tracking: Tracking;
  readonly clock: Clock;
}

/**
 * Checks the invariants that must hold under the order lock before assigning.
 * @throws DispatchError order_already_assigned / rider_unavailable
 */
export async function assertAssignable(
  store: DispatchStore,
  orderId: string,
  riderId: string,
): Promise<void> {
  if (await store.activeTripForOrder(orderId)) {
    throw new DispatchError('order_already_assigned', 'This order already has a rider.');
  }
  const rider = await store.getRider(riderId);
  if (rider?.status !== 'online' || (await store.activeTripForRider(riderId))) {
    throw new DispatchError('rider_unavailable', 'The rider is not available for a new trip.');
  }
}

/**
 * Creates the trip atomically with the request/rider updates and the outbox event, and tells
 * ordering inside the same transaction (a failing port rolls everything back). The caller must
 * hold the order lock. Partial unique indexes on active trips are the last line of defence.
 */
export async function assignRider(
  deps: AssignDeps,
  req: DispatchRequest,
  riderId: string,
  source: AssignmentSource,
  event: (trip: TripRecord) => DispatchEvent,
  extra?: (tx: DispatchStore) => Promise<void>,
): Promise<TripRecord> {
  const now = deps.clock.now();
  const trip: TripRecord = {
    id: deps.clock.uuid(),
    orderId: req.orderId,
    riderId,
    offerId: source.offerId,
    status: 'assigned',
    pickup: req.pickup,
    dropoff: req.dropoff,
    assignment: source.offerId ? 'offer' : 'manual',
    assignedBy: source.assignedBy,
    assignmentReason: source.reason,
    undeliverableReason: null,
    createdAt: now,
    updatedAt: now,
  };
  await deps.store.transaction(async (tx) => {
    await extra?.(tx);
    await tx.insertTrip(trip);
    await tx.updateRequest(req.orderId, { status: 'assigned' });
    await tx.setRiderStatus(riderId, 'on_trip');
    await tx.setLastJobAt(riderId, now);
    await tx.emit(event(trip));
    // DEBT(dispatch): ordering is called inside our DB transaction; if our commit fails after it succeeded, ordering holds a rider we did not record — needs ordering's markRiderAssigned to be idempotent and a reconciliation sweep.
    await deps.port.markRiderAssigned(req.orderId, riderId);
  });
  await deps.tracking.startTrip(riderId, req.orderId);
  return trip;
}
