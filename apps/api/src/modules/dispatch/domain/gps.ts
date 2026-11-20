import { haversineMeters } from '@delyva/utils';
import { DispatchError } from './dispatch-errors.js';

/** A position with its device timestamp (epoch ms). */
export interface Fix {
  readonly lat: number;
  readonly lng: number;
  readonly ts: number;
}

/** GPS sanity policy. */
export interface GpsPolicy {
  /** Max distance (m) between the rider and the pickup/drop-off for a status change. */
  readonly maxDistanceM: number;
  /** Oldest device fix accepted for an offline-replayed action (ms). */
  readonly replayMaxAgeMs: number;
}

/** Device fixes may be at most this far in the future (clock skew). */
export const MAX_FUTURE_SKEW_MS = 30_000;
/** A device fix is treated as a replay only when the server already holds a newer fix by this much. */
export const REPLAY_MIN_LAG_MS = 15_000;

/**
 * Picks the fix to check. The server's live position wins, except for an offline-replayed
 * action: the device fix recorded when the action happened is used when it is recent enough and
 * clearly older than the server's position (the rider has moved on since).
 */
export function chooseFix(
  server: Fix | null,
  device: Fix | undefined,
  now: number,
  policy: GpsPolicy,
): { fix: Fix; source: 'server' | 'device' } | null {
  const deviceUsable =
    device !== undefined &&
    device.ts <= now + MAX_FUTURE_SKEW_MS &&
    now - device.ts <= policy.replayMaxAgeMs;
  if (deviceUsable && (server === null || server.ts - device.ts >= REPLAY_MIN_LAG_MS)) {
    return { fix: device, source: 'device' };
  }
  return server ? { fix: server, source: 'server' } : null;
}

/**
 * GPS sanity check for a rider status change.
 * @throws DispatchError rider_too_far when there is no fix or it is too far from the target
 */
export function assertNear(
  fix: Fix | null,
  target: { lat: number; lng: number },
  label: 'pickup' | 'drop-off',
  policy: GpsPolicy,
): number {
  if (!fix) {
    throw new DispatchError(
      'rider_too_far',
      `No recent location. Turn on location and retry at the ${label}.`,
    );
  }
  const distance = Math.round(haversineMeters(fix, target));
  if (distance > policy.maxDistanceM) {
    throw new DispatchError(
      'rider_too_far',
      `You are about ${distance} m from the ${label}; move within ${policy.maxDistanceM} m and retry.`,
    );
  }
  return distance;
}
