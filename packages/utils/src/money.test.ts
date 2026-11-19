import { describe, expect, it } from 'vitest';
import { Money, MoneyError } from './money.js';

const ngn = (minor: number): Money => Money.ofMinor(minor, 'NGN');

describe('Money', () => {
  it('rejects floats and unsafe integers', () => {
    expect(() => ngn(10.5)).toThrow(MoneyError);
    expect(() => ngn(Number.NaN)).toThrow(MoneyError);
    expect(() => ngn(2 ** 60)).toThrow(MoneyError);
  });

  it('rejects unsupported currencies', () => {
    expect(() => Money.ofMinor(1, 'XYZ' as 'NGN')).toThrow(MoneyError);
  });

  it('adds and subtracts in the same currency', () => {
    expect(ngn(150).add(ngn(250)).minor).toBe(400);
    expect(ngn(150).subtract(ngn(250)).minor).toBe(-100);
    expect(Money.zero('NGN').minor).toBe(0);
  });

  it('rejects mixing currencies', () => {
    expect(() => ngn(1).add(Money.ofMinor(1, 'USD'))).toThrow(/mismatch/);
    expect(() => ngn(1).compare(Money.ofMinor(1, 'USD'))).toThrow(MoneyError);
  });

  it('multiplies by integer factors only', () => {
    expect(ngn(250).multiply(3).minor).toBe(750);
    expect(() => ngn(250).multiply(1.5)).toThrow(MoneyError);
  });

  it('allocates without losing a kobo', () => {
    const parts = ngn(100).allocate([1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([34, 33, 33]);
    expect(parts.reduce((a, b) => a.add(b)).minor).toBe(100);
  });

  it('allocates negative amounts and skips zero ratios', () => {
    const parts = ngn(-101).allocate([0, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([0, -51, -50]);
  });

  it('allocates a vendor/rider/platform split exactly', () => {
    const parts = ngn(1_000_001).allocate([80, 15, 5]);
    expect(parts.map((p) => p.minor)).toEqual([800001, 150000, 50000]);
  });

  it('rejects invalid ratios', () => {
    expect(() => ngn(1).allocate([])).toThrow(MoneyError);
    expect(() => ngn(1).allocate([0, 0])).toThrow(MoneyError);
    expect(() => ngn(1).allocate([-1, 2])).toThrow(MoneyError);
    expect(() => ngn(1).allocate([0.5])).toThrow(MoneyError);
  });

  it('formats naira with grouping', () => {
    expect(ngn(1_250_050).format()).toBe('₦12,500.50');
    expect(ngn(-5).format()).toBe('-₦0.05');
    expect(Money.ofMinor(1234, 'USD').format()).toBe('USD 12.34');
  });

  it('compares and checks equality', () => {
    expect(ngn(1).compare(ngn(2))).toBe(-1);
    expect(ngn(2).compare(ngn(2))).toBe(0);
    expect(ngn(3).compare(ngn(2))).toBe(1);
    expect(ngn(3).equals(ngn(3))).toBe(true);
    expect(ngn(3).equals(Money.ofMinor(3, 'USD'))).toBe(false);
    expect(ngn(-3).isNegative()).toBe(true);
  });

  it('serialises to the wire shape', () => {
    expect(JSON.parse(JSON.stringify(ngn(500)))).toEqual({ amountMinor: 500, currency: 'NGN' });
  });
});
