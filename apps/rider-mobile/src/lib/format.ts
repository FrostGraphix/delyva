import { Money } from '@delyva/utils';

/** Formats kobo as ₦ with Nigerian grouping (integer minor units only). */
export function formatNaira(minor: number): string {
  return Money.ofMinor(minor, 'NGN').format('en-NG');
}

/** Formats metres as "850 m" / "2.4 km". */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${String(Math.round(metres))} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

/** Formats seconds as whole minutes, at least 1 ("4 min"). */
export function formatMinutes(seconds: number): string {
  return `${String(Math.max(1, Math.round(seconds / 60)))} min`;
}

/** Formats basis points as a whole percentage, or an em dash when unknown. */
export function formatBps(bps: number | null): string {
  return bps === null ? '—' : `${String(Math.round(bps / 100))}%`;
}

/** Converts a local Nigerian number (0803…) or E.164 into E.164 (+234803…); null if invalid. */
export function toE164Nigeria(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  const e164 = digits.startsWith('+234')
    ? digits
    : digits.startsWith('234')
      ? `+${digits}`
      : digits.startsWith('0')
        ? `+234${digits.slice(1)}`
        : `+234${digits}`;
  return /^\+234[789][01]\d{8}$/.test(e164) ? e164 : null;
}
