import {
  type AdminDispatchRiderList,
  DISPATCH_EVENTS,
  type OrderManuallyAssignedPayload,
  type Trip,
} from '@delyva/contracts';
import type { Logger } from 'pino';
import type { AuthPrincipal } from '../../../shared/auth/auth.guard.js';
import { DispatchError } from '../domain/dispatch-errors.js';
import { type AssignDeps, assertAssignable, assignRider } from './assign-rider.js';
import { toTripDto } from './dto.js';
import type { OrderLock } from './ports.js';

const OPS_ROLES = ['ops', 'super_admin'];

function assertOps(principal: AuthPrincipal): void {
  if (!principal.roles.some((r) => OPS_ROLES.includes(r))) {
    throw new DispatchError('forbidden', 'Only ops can do this.');
  }
}

/** Ops tooling: live rider list and manual dispatch override. */
export class OpsDispatch {
  /** @param deps ports */
  constructor(private readonly deps: AssignDeps & { lock: OrderLock; logger: Logger }) {}

  /** GET /v1/admin/dispatch/riders — online and on-trip riders with their last position. */
  async riders(principal: AuthPrincipal): Promise<AdminDispatchRiderList> {
    assertOps(principal);
    const { store, tracking } = this.deps;
    const riders = await store.ridersWithStatus(['online', 'on_trip']);
    const items = await Promise.all(
      riders.map(async (r) => {
        const [pos, trip] = await Promise.all([
          tracking.positionOf(r.riderId),
          store.activeTripForRider(r.riderId),
        ]);
        return {
          riderId: r.riderId,
          status: r.status,
          vehiclePlate: r.vehiclePlate,
          batteryPct: r.batteryPct,
          position: pos ? { lat: pos.lat, lng: pos.lng, ts: pos.ts } : null,
          activeOrderId: trip?.orderId ?? null,
        };
      }),
    );
    return { items };
  }

  /**
   * POST /v1/admin/dispatch/orders/{orderId}/assign — supersedes any pending offer, assigns
   * under the same order lock as rider accepts, and records who and why.
   * DEBT(admin): reason lives on the trip row + outbox event only — no immutable admin audit log yet — write to the admin audit log when it exists.
   */
  async assign(
    principal: AuthPrincipal,
    orderId: string,
    riderId: string,
    reason: string,
  ): Promise<Trip> {
    assertOps(principal);
    const { store, lock, clock, logger } = this.deps;
    return lock.withLock(orderId, async () => {
      const req = await store.getRequest(orderId);
      if (!req) throw new DispatchError('not_found', 'No dispatch request for this order.');
      const existing = await store.activeTripForOrder(orderId);
      if (existing?.riderId === riderId && existing.assignment === 'manual')
        return toTripDto(existing);
      await assertAssignable(store, orderId, riderId);
      const pending = await store.pendingOfferForOrder(orderId);
      const trip = await assignRider(
        this.deps,
        req,
        riderId,
        { offerId: null, assignedBy: principal.userId, reason },
        (t) => ({
          type: DISPATCH_EVENTS.orderManuallyAssigned,
          aggregateType: 'dispatch_order',
          aggregateId: orderId,
          payload: {
            orderId,
            riderId,
            tripId: t.id,
            assignedBy: principal.userId,
            reason,
          } satisfies OrderManuallyAssignedPayload,
        }),
        async (tx) => {
          if (pending) await tx.setOfferStatus(pending.id, 'superseded', clock.now());
        },
      );
      logger.info({ orderId, tripId: trip.id }, 'manual dispatch override');
      return toTripDto(trip);
    });
  }
}
