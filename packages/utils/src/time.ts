/** Africa/Lagos IANA zone (WAT, UTC+1, no DST). */
export const LAGOS_TZ = 'Africa/Lagos';

/** Milliseconds per unit, for readable durations. */
export const MS = { second: 1_000, minute: 60_000, hour: 3_600_000, day: 86_400_000 } as const;

/** Returns a new Date `ms` milliseconds after `from`. */
export function addMs(from: Date, ms: number): Date {
  return new Date(from.getTime() + ms);
}

/** True when `at` is strictly after `deadline`. */
export function isExpired(deadline: Date, at: Date = new Date()): boolean {
  return at.getTime() > deadline.getTime();
}

/** Formats a time as 12-hour Lagos local time, e.g. `2:05 PM`. */
export function formatLagosTime(date: Date, locale = 'en-NG'): string {
  const fmt = new Intl.DateTimeFormat(locale, {
    timeZone: LAGOS_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return fmt.format(date).toUpperCase();
}

/** Whole minutes between two instants, rounded up (for ETAs). Never negative. */
export function minutesUntil(target: Date, from: Date = new Date()): number {
  return Math.max(0, Math.ceil((target.getTime() - from.getTime()) / MS.minute));
}
