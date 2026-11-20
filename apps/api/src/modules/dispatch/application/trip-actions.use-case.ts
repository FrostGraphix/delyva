import type { Trip } from '@delyva/contracts';
import type { Logger } from 'pino';
import type { AuthPrincipal } from '../../../shared/auth/auth.guard.js';
import { DispatchError } from '../domain/dispatch-errors.js';
import { assertNear, chooseFix, type Fix, type GpsPolicy } from '../domain/gps.js';
import { isTerminalTrip, planTripAction, type TripActionKind } from '../domain/trip.js';
import { toTripDto } from './dto.js';
import type { OrderFulfilmentPort } from './ordering-contract.temp.js';
import type {
  Clock,
  DispatchConfig,
  DispatchStore,
  OrderLock,
  TripRecord,
  Tracking,
} from './ports.js';
import { assertRider } from './rider-availability.use-cases.js';

/** Action input (codes are verified by ordering, never stored by dispatch). */
export interface TripActionInput {
  readonly pickupCode?: string;
  readonly deliveryOtp?: string;
  readonly reason?: string;
  /** Device fix recorded when the action happened (offline replay). */
  readonly location?: Fix;
}

/** Dependencies of {@link PerformTripAction}. */
export interface TripActionDeps {
  readonly store: DispatchStore;
  readonly port: OrderFulfilmentPort;
  readonly tracking: Tracking;
  readonly lock: OrderLock;
  readonly clock: Clock;
  readonly config: Pick<DispatchConfig, 'gpsMaxDistanceM' | 'gpsReplayMaxAgeMs'>;
  readonly logger: Logger;
}

/**
 * Command: a rider status change on their own trip. Ownership (404 for others' trips),
 * explicit transition table, GPS sanity check, then delegation to ordering. Replays of an
 * already-applied action succeed without calling ordering again.
 */
export class PerformTripAction {
  /** @param deps ports */
  constructor(private readonly deps: TripActionDeps) {}

  /** Executes the action. */
  async execute(
    principal: AuthPrincipal,
    tripId: string,
    action: TripActionKind,
    input: TripActionInput,
  ): Promise<Trip> {
    const riderId = assertRider(principal);
    const owned = await this.deps.store.getTrip(tripId);
    if (owned?.riderId !== riderId) throw new DispatchError('not_found', 'Trip not found.');
    return this.deps.lock.withLock(owned.orderId, async () => {
      const trip = await this.deps.store.getTrip(tripId);
      if (!trip) throw new DispatchError('not_found', 'Trip not found.');
      const plan = planTripAction(trip.status, action);
      if (plan.kind === 'already_applied') return toTripDto(trip);
      await this.checkGps(trip, plan.near, input.location);
      await this.delegate(trip, action, input);
      return toTripDto(await this.apply(trip, plan.to, input.reason));
    });
  }

  private async checkGps(
    trip: TripRecord,
    near: 'pickup' | 'dropoff',
    device: Fix | undefined,
  ): Promise<void> {
    const policy: GpsPolicy = {
      maxDistanceM: this.deps.config.gpsMaxDistanceM,
      replayMaxAgeMs: this.deps.config.gpsReplayMaxAgeMs,
    };
    const server = await this.deps.tracking.positionOf(trip.riderId);
    const chosen = chooseFix(server, device, this.deps.clock.now().getTime(), policy);
    const target = near === 'pickup' ? trip.pickup : trip.dropoff;
    const distanceM = assertNear(
      chosen?.fix ?? null,
      target,
      near === 'pickup' ? 'pickup' : 'drop-off',
      policy,
    );
    this.deps.logger.info(
      { tripId: trip.id, orderId: trip.orderId, distanceM, gpsSource: chosen?.source },
      'trip gps check passed',
    );
  }

  private async delegate(
    trip: TripRecord,
    action: TripActionKind,
    input: TripActionInput,
  ): Promise<void> {
    const { port } = this.deps;
    const { orderId, riderId } = trip;
    switch (action) {
      case 'arrived_at_vendor':
        return port.markRiderAtVendor(orderId, riderId, required(input.pickupCode, 'pickupCode'));
      case 'picked_up':
        return port.markPickedUp(orderId, riderId);
      case 'arrived_at_customer':
        return port.markRiderAtCustomer(orderId, riderId);
      case 'delivered':
        return port.markDelivered(orderId, riderId, required(input.deliveryOtp, 'deliveryOtp'));
      case 'undeliverable':
        return port.markUndeliverable(orderId, riderId, required(input.reason, 'reason'));
    }
  }

  private async apply(
    trip: TripRecord,
    to: TripRecord['status'],
    reason: string | undefined,
  ): Promise<TripRecord> {
    const { store, tracking, clock } = this.deps;
    const now = clock.now();
    await store.transaction(async (tx) => {
      await tx.updateTrip(trip.id, {
        status: to,
        updatedAt: now,
        ...(to === 'undeliverable' && reason ? { undeliverableReason: reason } : {}),
      });
      if (isTerminalTrip(to)) {
        await tx.setRiderStatus(trip.riderId, 'online');
        await tx.setLastJobAt(trip.riderId, now);
      }
    });
    // Stop sharing the rider's location once the trip ends (privacy rule).
    if (isTerminalTrip(to)) await tracking.endTrip(trip.riderId);
    return { ...trip, status: to, updatedAt: now };
  }
}

function required(value: string | undefined, name: string): string {
  if (value === undefined) throw new DispatchError('validation_failed', `${name} is required.`);
  return value;
}
