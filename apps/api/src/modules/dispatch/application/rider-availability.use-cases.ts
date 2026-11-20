import type { CurrentTrip, RiderEarnings, RiderProfile } from '@delyva/contracts';
import type { AuthPrincipal } from '../../../shared/auth/auth.guard.js';
import { DispatchError } from '../domain/dispatch-errors.js';
import { statusAfterGoOffline, statusAfterGoOnline } from '../domain/rider.js';
import { toRiderProfileDto, toTripDto } from './dto.js';
import type { DispatchConfig, DispatchStore } from './ports.js';

/** Enforced again in every rider use case (defence in depth behind the `@Roles` guard). */
export function assertRider(principal: AuthPrincipal): string {
  if (!principal.roles.includes('rider')) {
    throw new DispatchError('forbidden', 'Only riders can do this.');
  }
  return principal.userId;
}

/** Rider self-service: profile, availability, current trip, earnings. */
export class RiderSelfService {
  /** @param store dispatch store @param config tunables */
  constructor(
    private readonly store: DispatchStore,
    private readonly config: Pick<DispatchConfig, 'minBatteryPct'>,
  ) {}

  /** GET /v1/riders/me — creates the profile on first access. */
  async profile(principal: AuthPrincipal): Promise<RiderProfile> {
    return toRiderProfileDto(await this.store.ensureRider(assertRider(principal)));
  }

  /** POST /v1/riders/me/online */
  async goOnline(principal: AuthPrincipal, batteryPct: number): Promise<RiderProfile> {
    const riderId = assertRider(principal);
    const current = await this.store.ensureRider(riderId);
    const status = statusAfterGoOnline(current.status, batteryPct, this.config.minBatteryPct);
    await this.store.setRiderStatus(riderId, status, batteryPct);
    return this.profile(principal);
  }

  /** POST /v1/riders/me/offline */
  async goOffline(principal: AuthPrincipal, batteryPct: number): Promise<RiderProfile> {
    const riderId = assertRider(principal);
    const current = await this.store.ensureRider(riderId);
    await this.store.setRiderStatus(riderId, statusAfterGoOffline(current.status), batteryPct);
    return this.profile(principal);
  }

  /** GET /v1/riders/me/trips/current */
  async currentTrip(principal: AuthPrincipal): Promise<CurrentTrip> {
    const trip = await this.store.activeTripForRider(assertRider(principal));
    return { trip: trip ? toTripDto(trip) : null };
  }

  /**
   * GET /v1/riders/me/earnings.
   * DEBT(dispatch): balance is null — PaymentsService has no rider_payable balance read yet — add `PaymentsService.riderBalance(riderId)` and return it here.
   */
  async earnings(principal: AuthPrincipal): Promise<RiderEarnings> {
    const completedTrips = await this.store.countTrips(assertRider(principal), 'delivered');
    return { currency: 'NGN', balanceMinor: null, completedTrips, available: false };
  }
}
