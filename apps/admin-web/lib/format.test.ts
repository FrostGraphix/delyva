import { describe, expect, it } from 'vitest';
import {
  formatBps,
  formatKobo,
  formatMinute,
  koboToNairaInput,
  parseMinute,
  parseNairaToKobo,
  startOfLagosDay,
} from './format';
import { t } from './i18n';
import { canAccess, hasConsoleRole } from './roles';

describe('money input', () => {
  it('parses naira into integer kobo without floats', () => {
    expect(parseNairaToKobo('1500')).toBe(150_000);
    expect(parseNairaToKobo('1,500.5')).toBe(150_050);
    expect(parseNairaToKobo('₦0.07')).toBe(7);
  });

  it('rejects negatives, letters and >2 decimals', () => {
    expect(parseNairaToKobo('-1')).toBeNull();
    expect(parseNairaToKobo('abc')).toBeNull();
    expect(parseNairaToKobo('1.234')).toBeNull();
    expect(parseNairaToKobo('')).toBeNull();
  });

  it('round-trips kobo to the input value', () => {
    expect(koboToNairaInput(150_000)).toBe('1500');
    expect(koboToNairaInput(150_005)).toBe('1500.05');
    expect(formatKobo(150_000)).toContain('1,500');
  });
});

describe('time and bps', () => {
  it('formats and parses minutes after midnight', () => {
    expect(formatMinute(1020)).toBe('17:00');
    expect(parseMinute('17:30')).toBe(1050);
    expect(parseMinute('24:00')).toBe(1440);
    expect(parseMinute('25:00')).toBeNull();
    expect(formatBps(750)).toBe('7.5%');
  });

  it('computes the start of the Lagos day (UTC+1)', () => {
    expect(startOfLagosDay(new Date('2026-11-21T23:30:00Z'))).toBe('2026-11-21T23:00:00.000Z');
    expect(startOfLagosDay(new Date('2026-11-21T10:00:00Z'))).toBe('2026-11-20T23:00:00.000Z');
  });
});

describe('roles and i18n', () => {
  it('gates sections by role', () => {
    expect(hasConsoleRole(['customer'])).toBe(false);
    expect(hasConsoleRole(['customer', 'support'])).toBe(true);
    expect(canAccess('flags', ['ops'])).toBe(false);
    expect(canAccess('flags', ['super_admin'])).toBe(true);
    expect(canAccess('orderCancel', ['support'])).toBe(false);
  });

  it('fills placeholders and leaves unknown ones', () => {
    expect(t('order.title', { ref: 'DLV-1' })).toBe('Order DLV-1');
    expect(t('order.title')).toBe('Order {ref}');
  });
});
