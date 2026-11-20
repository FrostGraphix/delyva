import { BPS_DENOMINATOR, clamp } from './rounding.js';

/** Distance tier: applies to kilometres that START below `upToMeters` (null = unbounded). */
export interface DistanceTierConfig {
  readonly upToMeters: number | null;
  readonly perKmMinor: number;
}

/** Fee configuration for one zone. All amounts are integer kobo; rates are basis points. */
export interface FeeRuleConfig {
  readonly zoneCode: string;
  readonly currency: 'NGN';
  readonly baseFeeMinor: number;
  readonly baseDistanceMeters: number;
  readonly tiers: readonly DistanceTierConfig[];
  readonly minFeeMinor: number;
  readonly maxFeeMinor: number;
  readonly maxDistanceMeters: number;
  readonly smallOrderThresholdMinor: number;
  readonly smallOrderFeeMinor: number;
  readonly serviceFeeBps: number;
  readonly serviceFeeCapMinor: number;
  readonly vatBps: number;
  readonly maxSurgeBps: number;
  readonly active: boolean;
}

/** Metres per charged kilometre. */
export const METERS_PER_KM = 1_000;

function tierIssues(rule: FeeRuleConfig): string[] {
  const issues: string[] = [];
  let previous = rule.baseDistanceMeters;
  rule.tiers.forEach((tier, i) => {
    const isLast = i === rule.tiers.length - 1;
    if (tier.upToMeters === null && !isLast)
      issues.push(`tiers[${String(i)}]: only the last tier may be unbounded`);
    if (tier.upToMeters !== null && tier.upToMeters <= previous) {
      issues.push(`tiers[${String(i)}]: upToMeters must increase and exceed baseDistanceMeters`);
    }
    previous = tier.upToMeters ?? previous;
  });
  const last = rule.tiers.at(-1);
  const covered = last === undefined ? rule.baseDistanceMeters : (last.upToMeters ?? Infinity);
  if (covered < rule.maxDistanceMeters)
    issues.push('tiers must cover distances up to maxDistanceMeters');
  return issues;
}

/** Returns human-readable invariant violations of a fee rule (empty when valid). */
export function feeRuleIssues(rule: FeeRuleConfig): string[] {
  const issues = tierIssues(rule);
  if (rule.minFeeMinor > rule.maxFeeMinor) issues.push('minFeeMinor must not exceed maxFeeMinor');
  if (rule.baseDistanceMeters > rule.maxDistanceMeters) {
    issues.push('baseDistanceMeters must not exceed maxDistanceMeters');
  }
  if (rule.maxSurgeBps < BPS_DENOMINATOR) issues.push('maxSurgeBps must be at least 10000 (1.0x)');
  return issues;
}

function rateForKmStartingAt(startMeters: number, tiers: readonly DistanceTierConfig[]): number {
  const tier = tiers.find((t) => t.upToMeters === null || startMeters < t.upToMeters);
  return tier?.perKmMinor ?? tiers.at(-1)?.perKmMinor ?? 0;
}

/**
 * Distance-based delivery fee before surge: base fee covers `baseDistanceMeters`; each STARTED
 * kilometre beyond it is charged at the rate of the tier the kilometre starts in. The result is
 * clamped to `[minFeeMinor, maxFeeMinor]`. Caller guarantees `distanceMeters <= maxDistanceMeters`.
 */
export function deliveryFeeMinor(rule: FeeRuleConfig, distanceMeters: number): number {
  const extraMeters = Math.max(0, distanceMeters - rule.baseDistanceMeters);
  const startedKm = Math.ceil(extraMeters / METERS_PER_KM);
  let fee = rule.baseFeeMinor;
  for (let km = 0; km < startedKm; km++) {
    fee += rateForKmStartingAt(rule.baseDistanceMeters + km * METERS_PER_KM, rule.tiers);
  }
  return clamp(fee, rule.minFeeMinor, rule.maxFeeMinor);
}
