import type { MoneyDto } from '@delyva/contracts';
import { type CurrencyCode, Money } from '@delyva/utils';

/** Formats wire money (integer minor units) as e.g. `₦3,500`. */
export function formatMoney(m: {
  readonly amountMinor: number;
  readonly currency: string;
}): string {
  return Money.ofMinor(m.amountMinor, m.currency as CurrencyCode).format('en-NG');
}

/**
 * Parses a naira amount typed by a person ("3500", "3,500.5", "₦3500.50") into integer kobo using
 * string arithmetic only (never floats). Returns null for anything else.
 */
export function parseNairaToMinor(input: string): number | null {
  const clean = input.replace(/[₦,\s]/g, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!m?.[1]) return null;
  const kobo = (m[2] ?? '').padEnd(2, '0');
  return Number(m[1]) * 100 + Number(kobo);
}

/** Formats integer kobo back into an editable naira string ("3500" or "3500.50"). */
export function minorToNairaInput(minor: number): string {
  const naira = Math.trunc(minor / 100);
  const kobo = minor % 100;
  return kobo === 0 ? String(naira) : `${String(naira)}.${String(kobo).padStart(2, '0')}`;
}

/** Sums wire money values of one currency into a new value. */
export function sumMoney(values: readonly MoneyDto[], currency: MoneyDto['currency']): MoneyDto {
  return {
    amountMinor: values.reduce((acc, v) => acc + v.amountMinor, 0),
    currency,
  };
}
