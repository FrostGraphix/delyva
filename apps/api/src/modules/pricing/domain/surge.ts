import { BPS_DENOMINATOR } from './rounding.js';

/** Lagos (WAT) is UTC+1 all year with no DST, so local time is a fixed offset. */
export const LAGOS_UTC_OFFSET_MINUTES = 60;
const MINUTES_PER_DAY = 1_440;

/** Rule-based surge window: `[startMinute, endMinute)` on the listed local weekdays. */
export interface SurgeRuleConfig {
  readonly zoneCode: string;
  readonly daysOfWeek: readonly number[];
  readonly startMinute: number;
  readonly endMinute: number;
  readonly multiplierBps: number;
  readonly active: boolean;
}

/** Local weekday (0 = Sunday) and minute of day. */
export interface LocalTime {
  readonly dayOfWeek: number;
  readonly minuteOfDay: number;
}

/** Converts an instant to Lagos local weekday + minute-of-day. */
export function lagosLocalTime(at: Date): LocalTime {
  const local = new Date(at.getTime() + LAGOS_UTC_OFFSET_MINUTES * 60_000);
  return {
    dayOfWeek: local.getUTCDay(),
    minuteOfDay: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** Invariant violations of a surge rule (empty when valid). */
export function surgeRuleIssues(rule: SurgeRuleConfig): string[] {
  const issues: string[] = [];
  if (rule.startMinute >= rule.endMinute || rule.endMinute > MINUTES_PER_DAY) {
    issues.push('startMinute must be before endMinute within one day (split overnight windows)');
  }
  if (rule.multiplierBps < BPS_DENOMINATOR) issues.push('multiplierBps must be at least 10000');
  if (new Set(rule.daysOfWeek).size !== rule.daysOfWeek.length)
    issues.push('daysOfWeek must be unique');
  return issues;
}

function matches(rule: SurgeRuleConfig, zoneCode: string, t: LocalTime): boolean {
  return (
    rule.active &&
    rule.zoneCode === zoneCode &&
    rule.daysOfWeek.includes(t.dayOfWeek) &&
    t.minuteOfDay >= rule.startMinute &&
    t.minuteOfDay < rule.endMinute
  );
}

/**
 * Effective surge multiplier (bps) for a zone at an instant: the HIGHEST matching rule wins
 * (rules never compound), capped at `capBps`. Returns 10_000 (1.0x) when nothing matches.
 */
export function surgeMultiplierBps(
  rules: readonly SurgeRuleConfig[],
  zoneCode: string,
  at: Date,
  capBps: number,
): number {
  const t = lagosLocalTime(at);
  const best = rules
    .filter((r) => matches(r, zoneCode, t))
    .reduce((max, r) => Math.max(max, r.multiplierBps), BPS_DENOMINATOR);
  return Math.max(BPS_DENOMINATOR, Math.min(best, capBps));
}
