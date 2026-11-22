import type { MoneyDto } from '@delyva/contracts';
import { Money } from '@delyva/utils';

/** Formats integer kobo as `₦2,500.00` (locale-aware grouping; never floats). */
export function formatMinor(amountMinor: number): string {
  return Money.ofMinor(amountMinor, 'NGN').format('en-NG');
}

/** Formats a wire money DTO. */
export function formatMoney(m: MoneyDto): string {
  return formatMinor(m.amountMinor);
}

/** Parses a whole-naira input ("2,500") into kobo, or null when not a positive integer. */
export function nairaInputToMinor(raw: string): number | null {
  const digits = raw.replace(/[,\s₦]/g, '');
  if (!/^\d{1,9}$/.test(digits)) return null;
  const naira = Number.parseInt(digits, 10);
  return naira > 0 ? naira * 100 : null;
}
