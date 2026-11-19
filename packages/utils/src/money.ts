/** ISO 4217 currency codes supported by Delyva, with their minor-unit exponent. */
export const CURRENCY_EXPONENT = { NGN: 2, GHS: 2, KES: 2, USD: 2 } as const;

/** A supported ISO 4217 currency code. */
export type CurrencyCode = keyof typeof CURRENCY_EXPONENT;

/** Thrown when a Money operation would break an invariant (floats, currency mix, etc.). */
export class MoneyError extends Error {
  /** @param message human-readable reason */
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer, got ${String(value)}`);
  }
}

function isCurrency(code: string): code is CurrencyCode {
  return Object.hasOwn(CURRENCY_EXPONENT, code);
}

/**
 * Immutable money value object. Amounts are integers in minor units (kobo for NGN).
 * Floats are rejected everywhere; there is no way to construct fractional minor units.
 */
export class Money {
  private constructor(
    /** Amount in minor units (e.g. kobo). */
    readonly minor: number,
    /** ISO 4217 currency code. */
    readonly currency: CurrencyCode,
  ) {}

  /** Creates Money from integer minor units. @throws MoneyError on non-integer input. */
  static ofMinor(minor: number, currency: CurrencyCode): Money {
    assertSafeInteger(minor, 'minor');
    if (!isCurrency(currency)) throw new MoneyError(`Unsupported currency ${String(currency)}`);
    return new Money(minor === 0 ? 0 : minor, currency);
  }

  /** Zero in the given currency. */
  static zero(currency: CurrencyCode): Money {
    return Money.ofMinor(0, currency);
  }

  /** Returns this + other. @throws MoneyError on currency mismatch. */
  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.ofMinor(this.minor + other.minor, this.currency);
  }

  /** Returns this - other. @throws MoneyError on currency mismatch. */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.ofMinor(this.minor - other.minor, this.currency);
  }

  /** Multiplies by an integer factor (e.g. quantity). Fractional factors are rejected. */
  multiply(factor: number): Money {
    assertSafeInteger(factor, 'factor');
    return Money.ofMinor(this.minor * factor, this.currency);
  }

  /**
   * Splits the amount by non-negative integer ratios without losing a single minor unit.
   * Remainder units go to the earliest non-zero shares, in order.
   */
  allocate(ratios: readonly number[]): Money[] {
    const total = validateRatios(ratios);
    const shares = ratios.map((r) => Math.trunc((this.minor * r) / total));
    let remainder = this.minor - shares.reduce((sum, s) => sum + s, 0);
    const step = remainder > 0 ? 1 : -1;
    for (let i = 0; remainder !== 0; i = (i + 1) % shares.length) {
      if (ratios[i] === 0) continue;
      shares[i] = (shares[i] ?? 0) + step;
      remainder -= step;
    }
    return shares.map((s) => Money.ofMinor(s, this.currency));
  }

  /** True when both amount and currency match. */
  equals(other: Money): boolean {
    return this.currency === other.currency && this.minor === other.minor;
  }

  /** True when the amount is below zero. */
  isNegative(): boolean {
    return this.minor < 0;
  }

  /** Compares amounts: -1, 0 or 1. @throws MoneyError on currency mismatch. */
  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.minor === other.minor) return 0;
    return this.minor < other.minor ? -1 : 1;
  }

  /** Formats for display, e.g. `₦12,500.00` with locale-aware grouping. */
  format(locale = 'en-NG'): string {
    const exponent = CURRENCY_EXPONENT[this.currency];
    const divisor = 10 ** exponent;
    const abs = Math.abs(this.minor);
    const major = Math.trunc(abs / divisor);
    const fraction = String(abs % divisor).padStart(exponent, '0');
    const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(major);
    const symbol = this.currency === 'NGN' ? '₦' : `${this.currency} `;
    return `${this.minor < 0 ? '-' : ''}${symbol}${grouped}.${fraction}`;
  }

  /** JSON shape used on the wire: `{ amountMinor, currency }`. */
  toJSON(): { amountMinor: number; currency: CurrencyCode } {
    return { amountMinor: this.minor, currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new MoneyError(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}

function validateRatios(ratios: readonly number[]): number {
  if (ratios.length === 0) throw new MoneyError('ratios must not be empty');
  for (const r of ratios) {
    assertSafeInteger(r, 'ratio');
    if (r < 0) throw new MoneyError('ratios must be non-negative');
  }
  const total = ratios.reduce((sum, r) => sum + r, 0);
  if (total === 0) throw new MoneyError('ratios must not sum to zero');
  return total;
}
