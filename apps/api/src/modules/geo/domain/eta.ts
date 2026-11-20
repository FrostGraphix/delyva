/** Tunables for the straight-line ETA heuristic. */
export interface EtaPolicy {
  /** Road distance ÷ straight-line distance (Lagos street grid + detours). */
  readonly roadFactor: number;
  /** Average rider speed in km/h including traffic. */
  readonly speedKmh: number;
  /** Fixed handling time (parking, handover) in minutes. */
  readonly handlingMinutes: number;
}

/** Lagos launch defaults; DEBT(geo): calibrate from real trip data once dispatch records trips. */
export const LAGOS_ETA_POLICY: EtaPolicy = { roadFactor: 1.4, speedKmh: 18, handlingMinutes: 5 };

/** Travel estimate between two points. */
export interface TravelEstimate {
  /** Straight-line distance in metres (rounded). */
  readonly distanceMeters: number;
  /** Estimated road travel time in whole minutes (rounded up, at least 1). */
  readonly travelMinutes: number;
}

/** Converts a straight-line distance into an estimated road travel time. */
export function estimateTravel(straightMeters: number, policy: EtaPolicy): TravelEstimate {
  if (!Number.isFinite(straightMeters) || straightMeters < 0) {
    throw new RangeError('distance must be a finite non-negative number');
  }
  const roadKm = (straightMeters * policy.roadFactor) / 1000;
  const minutes = Math.max(1, Math.ceil((roadKm / policy.speedKmh) * 60));
  return { distanceMeters: Math.round(straightMeters), travelMinutes: minutes };
}

/** Customer-facing delivery ETA in minutes: preparation + travel + handling. */
export function deliveryEtaMinutes(
  prepMinutes: number,
  travelMinutes: number,
  policy: EtaPolicy,
): number {
  return Math.ceil(Math.max(0, prepMinutes) + travelMinutes + policy.handlingMinutes);
}
