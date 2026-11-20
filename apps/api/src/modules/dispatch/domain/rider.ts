import { DispatchError } from './dispatch-errors.js';

/** Rider availability status. */
export type RiderStatus = 'offline' | 'online' | 'on_trip';

/** Rider profile state owned by dispatch. */
export interface RiderProfileState {
  readonly riderId: string;
  readonly vehiclePlate: string | null;
  readonly hub: string | null;
  readonly batteryPct: number | null;
  readonly status: RiderStatus;
  readonly offersReceived: number;
  readonly offersAccepted: number;
  readonly offersDeclined: number;
  readonly offersExpired: number;
  /** Rating × 100 (0–500), integer to keep comparisons exact. */
  readonly ratingX100: number;
  readonly lastJobAt: Date | null;
}

/** Rating every new rider starts with (5.00). */
export const INITIAL_RATING_X100 = 500;

/** Accepted / received in basis points, or null before the first offer. */
export function acceptanceRateBps(
  p: Pick<RiderProfileState, 'offersReceived' | 'offersAccepted'>,
): number | null {
  if (p.offersReceived === 0) return null;
  return Math.floor((p.offersAccepted * 10_000) / p.offersReceived);
}

/**
 * Status after "go online". A rider on a trip stays `on_trip`.
 * @throws DispatchError validation_failed when the battery is below the minimum
 */
export function statusAfterGoOnline(
  current: RiderStatus,
  batteryPct: number,
  minBatteryPct: number,
): RiderStatus {
  if (batteryPct < minBatteryPct) {
    throw new DispatchError(
      'validation_failed',
      `Battery must be at least ${minBatteryPct}% to go online.`,
    );
  }
  return current === 'on_trip' ? 'on_trip' : 'online';
}

/**
 * Status after "go offline".
 * @throws DispatchError conflict while on a trip
 */
export function statusAfterGoOffline(current: RiderStatus): RiderStatus {
  if (current === 'on_trip') {
    throw new DispatchError(
      'conflict',
      'Finish or hand over your current trip before going offline.',
    );
  }
  return 'offline';
}
