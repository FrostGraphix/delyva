import {
  LOCATION_MAX_AGE_MS,
  LOCATION_MAX_FUTURE_SKEW_MS,
  type RiderLocation,
} from '@delyva/contracts';

/** Socket location rate limit: NFR is one fix every 4–5 s on a trip; allow small bursts. */
export const SOCKET_LOCATION_LIMIT = { limit: 5, windowSeconds: 10 } as const;
/** HTTP batch rate limit per rider. */
export const HTTP_BATCH_LIMIT = { limit: 12, windowSeconds: 60 } as const;

/** Why a fix was rejected. */
export type FixRejection = 'stale' | 'future';

/** Checks a fix's device timestamp against server time. Shape/range is validated by contracts. */
export function checkFixFreshness(fix: RiderLocation, nowMs: number): FixRejection | null {
  if (fix.ts < nowMs - LOCATION_MAX_AGE_MS) return 'stale';
  if (fix.ts > nowMs + LOCATION_MAX_FUTURE_SKEW_MS) return 'future';
  return null;
}

/** Splits fixes into fresh (sorted by ts) and rejected counts. */
export function partitionFixes(
  fixes: readonly RiderLocation[],
  nowMs: number,
): { fresh: RiderLocation[]; rejected: number } {
  const fresh = fixes
    .filter((f) => checkFixFreshness(f, nowMs) === null)
    .sort((a, b) => a.ts - b.ts);
  return { fresh, rejected: fixes.length - fresh.length };
}

const STAFF: readonly string[] = ['ops', 'support', 'super_admin'];

/** Ops/support staff may observe any order or rider room. */
export const isOpsStaff = (roles: readonly string[]): boolean =>
  roles.some((r) => STAFF.includes(r));

/** Only riders may publish locations. */
export const isRider = (roles: readonly string[]): boolean => roles.includes('rider');
