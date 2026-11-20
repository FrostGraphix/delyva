/**
 * Integer rate maths for pricing. Rates are basis points (1 bp = 0.01 %, 10_000 bp = 100 %).
 * Intermediate products use BigInt so `amount * bps` can never lose precision above 2^53.
 *
 * Rounding rules (documented in docs/ARCHITECTURE.md § pricing):
 * - Fees and VAT charged to the customer: round half up to the nearest kobo ({@link applyBpsHalfUp}).
 * - Percentage discounts: round down ({@link applyBpsFloor}) so a discount never exceeds its stated rate.
 */

/** Basis points in 100 %. */
export const BPS_DENOMINATOR = 10_000;

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer, got ${String(value)}`);
  }
}

/** `round_half_up(amountMinor * bps / 10_000)` for non-negative integers. */
export function applyBpsHalfUp(amountMinor: number, bps: number): number {
  assertNonNegativeInt(amountMinor, 'amountMinor');
  assertNonNegativeInt(bps, 'bps');
  const scaled = BigInt(amountMinor) * BigInt(bps);
  return Number((scaled + BigInt(BPS_DENOMINATOR / 2)) / BigInt(BPS_DENOMINATOR));
}

/** `floor(amountMinor * bps / 10_000)` for non-negative integers. */
export function applyBpsFloor(amountMinor: number, bps: number): number {
  assertNonNegativeInt(amountMinor, 'amountMinor');
  assertNonNegativeInt(bps, 'bps');
  return Number((BigInt(amountMinor) * BigInt(bps)) / BigInt(BPS_DENOMINATOR));
}

/** Clamps `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
