import type { MoneyDto } from '@delyva/contracts';
import { LAGOS_TZ, Money } from '@delyva/utils';

/** Formats wire money as ₦ with en-NG grouping (integers only, never floats). */
export function formatMoney(m: MoneyDto): string {
  return Money.ofMinor(m.amountMinor, m.currency).format('en-NG');
}

/** Formats kobo as ₦. */
export function formatKobo(kobo: number): string {
  return Money.ofMinor(kobo, 'NGN').format('en-NG');
}

/** Lagos-time date + time for tables. */
export function formatDateTime(iso: string | number): string {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: LAGOS_TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** Basis points as a percentage string, e.g. 750 → "7.5%". */
export function formatBps(bps: number): string {
  return `${String(bps / 100)}%`;
}

/** Minutes after midnight as HH:MM. */
export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "HH:MM" → minutes after midnight, or null. */
export function parseMinute(value: string): number | null {
  const match = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute <= 1440 ? minute : null;
}

/**
 * Parses a naira string ("1,500", "1500.5", "1500.50") into integer kobo without floating
 * point. Returns null for anything else (negatives, >2 decimals, letters).
 */
export function parseNairaToKobo(input: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(input.replace(/[,\s₦]/g, ''));
  if (!match) return null;
  const naira = Number(match[1]);
  const kobo = Number((match[2] ?? '').padEnd(2, '0'));
  return naira * 100 + kobo;
}

/** Kobo → plain naira input value ("1500.50" or "1500"). */
export function koboToNairaInput(kobo: number): string {
  const naira = Math.floor(kobo / 100);
  const rest = kobo % 100;
  return rest === 0 ? String(naira) : `${String(naira)}.${String(rest).padStart(2, '0')}`;
}

/** Start of the current day in Lagos (UTC+1, no DST) as an ISO string. */
export function startOfLagosDay(now: Date = new Date()): string {
  const lagos = new Date(now.getTime() + 3_600_000);
  lagos.setUTCHours(0, 0, 0, 0);
  return new Date(lagos.getTime() - 3_600_000).toISOString();
}
