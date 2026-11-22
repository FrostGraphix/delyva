import type { OpeningHoursEntry } from '@delyva/contracts';

/** One editable interval. */
export interface Interval {
  readonly opensAt: string;
  readonly closesAt: string;
}

/** Week grid: index = dayOfWeek (0 = Sunday), each with zero or more intervals. */
export type Week = readonly (readonly Interval[])[];

/** Groups API entries into a 7-day grid, sorted by opening time. */
export function toWeek(entries: readonly OpeningHoursEntry[]): Week {
  return Array.from({ length: 7 }, (_, d) =>
    entries
      .filter((e) => e.dayOfWeek === d)
      .map((e) => ({ opensAt: e.opensAt, closesAt: e.closesAt }))
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt)),
  );
}

/** Flattens the grid back into API entries; null when any interval opens and closes at once. */
export function fromWeek(week: Week): OpeningHoursEntry[] | null {
  const out: OpeningHoursEntry[] = [];
  for (const [dayOfWeek, intervals] of week.entries()) {
    for (const i of intervals) {
      if (i.opensAt === i.closesAt) return null;
      out.push({ dayOfWeek, opensAt: i.opensAt, closesAt: i.closesAt });
    }
  }
  return out;
}

/** Default interval used when a closed day is switched open. */
export const DEFAULT_INTERVAL: Interval = { opensAt: '09:00', closesAt: '21:00' };
