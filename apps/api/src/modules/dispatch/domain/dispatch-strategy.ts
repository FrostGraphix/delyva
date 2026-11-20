/** A rider who passed the hard filters (online, in radius, no active trip or pending offer). */
export interface DispatchCandidate {
  readonly riderId: string;
  readonly distanceM: number;
  /** Null before the rider's first offer. */
  readonly acceptanceRateBps: number | null;
  readonly ratingX100: number;
  readonly lastJobAt: Date | null;
}

/** Candidate with the strategy's pickup ETA. */
export interface RankedCandidate extends DispatchCandidate {
  readonly pickupEtaSeconds: number;
}

/** Inputs a strategy may use besides the candidates. */
export interface DispatchContext {
  readonly now: Date;
  /** Average rider speed (m/s) for the straight-line ETA. */
  readonly riderSpeedMps: number;
}

/**
 * Pluggable ranking (ARCHITECTURE "Dispatch" 5): batching and ML scoring implement this later.
 * Returns candidates best first; must not drop or duplicate candidates.
 */
export interface DispatchStrategy {
  /** Ranks candidates, best first. */
  rank(candidates: readonly DispatchCandidate[], ctx: DispatchContext): RankedCandidate[];
}

/** ETAs within the same bucket are treated as equal so the tie-breakers matter. */
export const ETA_BUCKET_SECONDS = 60;
/** Acceptance rate assumed for riders without history (80 %). */
export const PRIOR_ACCEPTANCE_BPS = 8_000;

/** Straight-line pickup ETA in whole seconds (rounded up). */
export const pickupEtaSeconds = (distanceM: number, speedMps: number): number =>
  Math.ceil(distanceM / speedMps);

/**
 * Default strategy: pickup ETA (bucketed per minute) ascending, then acceptance rate desc,
 * rating desc, then fairness — longest time since last job first (never-worked riders first).
 */
export class EtaFirstStrategy implements DispatchStrategy {
  /** @inheritdoc */
  rank(candidates: readonly DispatchCandidate[], ctx: DispatchContext): RankedCandidate[] {
    const ranked = candidates.map((c) => ({
      ...c,
      pickupEtaSeconds: pickupEtaSeconds(c.distanceM, ctx.riderSpeedMps),
    }));
    return ranked.sort(compareCandidates);
  }
}

const idleSince = (c: DispatchCandidate): number => c.lastJobAt?.getTime() ?? 0;

function compareCandidates(a: RankedCandidate, b: RankedCandidate): number {
  const bucket = (x: RankedCandidate): number =>
    Math.floor(x.pickupEtaSeconds / ETA_BUCKET_SECONDS);
  return (
    bucket(a) - bucket(b) ||
    (b.acceptanceRateBps ?? PRIOR_ACCEPTANCE_BPS) - (a.acceptanceRateBps ?? PRIOR_ACCEPTANCE_BPS) ||
    b.ratingX100 - a.ratingX100 ||
    idleSince(a) - idleSince(b) ||
    a.riderId.localeCompare(b.riderId)
  );
}

/** Radius policy: widen one step after every `declinesBeforeWiden` declines/timeouts. */
export function radiusStepForDeclines(
  declines: number,
  declinesBeforeWiden: number,
  steps: number,
): number {
  return Math.min(Math.floor(declines / declinesBeforeWiden), steps - 1);
}

/**
 * Delay before the first offer so the rider arrives as the food is ready:
 * `readyAt − travel − now`, never negative.
 */
export function dispatchDelayMs(readyAt: Date, now: Date, travelSeconds: number): number {
  return Math.max(0, readyAt.getTime() - travelSeconds * 1_000 - now.getTime());
}
