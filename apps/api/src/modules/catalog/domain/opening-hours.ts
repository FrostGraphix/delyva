import { LAGOS_TZ } from '@delyva/utils';
import { CatalogError } from './catalog-errors.js';

/** One weekly interval in Lagos wall-clock time. `closesAt <= opensAt` runs past midnight. */
export interface WeeklyInterval {
  /** 0 = Sunday … 6 = Saturday. */
  readonly dayOfWeek: number;
  /** `HH:MM`. */
  readonly opensAt: string;
  /** `HH:MM`, or `24:00` for end of day. */
  readonly closesAt: string;
}

const MINUTES_PER_DAY = 1_440;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const lagosParts = new Intl.DateTimeFormat('en-US', {
  timeZone: LAGOS_TZ,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Parses `HH:MM` (or `24:00`) into minutes after midnight. */
export function toMinutes(time: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const h = Number(match?.[1]);
  const m = Number(match?.[2]);
  if (!match || h > 24 || m > 59 || (h === 24 && m !== 0)) {
    throw new CatalogError('validation_failed', `Invalid time ${time}`);
  }
  return h * 60 + m;
}

/** Day of week and minute-of-day of an instant in Africa/Lagos. */
export function lagosWeekMinute(at: Date): { dayOfWeek: number; minute: number } {
  const parts = Object.fromEntries(lagosParts.formatToParts(at).map((p) => [p.type, p.value]));
  const dayOfWeek = WEEKDAYS.indexOf(parts.weekday ?? '');
  return { dayOfWeek, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Interval as [start, end) minutes from Sunday 00:00; `end` may exceed one week (wraps). */
function weekRange(e: WeeklyInterval): [number, number] {
  const open = toMinutes(e.opensAt);
  const close = toMinutes(e.closesAt);
  const start = e.dayOfWeek * MINUTES_PER_DAY + open;
  const length = close > open ? close - open : MINUTES_PER_DAY - open + close;
  return [start, start + length];
}

/** True when the vendor is open at the instant (Lagos time), including overnight intervals. */
export function isOpenAt(hours: readonly WeeklyInterval[], at: Date): boolean {
  const { dayOfWeek, minute } = lagosWeekMinute(at);
  const now = dayOfWeek * MINUTES_PER_DAY + minute;
  return hours.some((e) => {
    const [start, end] = weekRange(e);
    return (
      (now >= start && now < end) ||
      (now + MINUTES_PER_WEEK >= start && now + MINUTES_PER_WEEK < end)
    );
  });
}

/** Rejects malformed or overlapping weekly intervals. @throws CatalogError validation_failed */
export function assertValidWeeklyHours(hours: readonly WeeklyInterval[]): void {
  const ranges = hours.map((e) => {
    if (!Number.isInteger(e.dayOfWeek) || e.dayOfWeek < 0 || e.dayOfWeek > 6) {
      throw new CatalogError('validation_failed', 'dayOfWeek must be 0-6');
    }
    if (toMinutes(e.opensAt) === toMinutes(e.closesAt) || e.opensAt === '24:00') {
      throw new CatalogError('validation_failed', 'Opening interval must be non-empty');
    }
    return weekRange(e);
  });
  const overlaps = (a: [number, number], b: [number, number]): boolean =>
    [0, MINUTES_PER_WEEK, -MINUTES_PER_WEEK].some((s) => a[0] < b[1] + s && b[0] + s < a[1]);
  ranges.forEach((a, i) => {
    ranges.slice(i + 1).forEach((b) => {
      if (overlaps(a, b)) throw new CatalogError('validation_failed', 'Opening hours overlap');
    });
  });
}
