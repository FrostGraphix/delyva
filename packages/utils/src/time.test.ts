import { describe, expect, it } from 'vitest';
import { addMs, formatLagosTime, isExpired, minutesUntil, MS } from './time.js';

describe('time', () => {
  const base = new Date('2026-01-01T12:00:00Z');

  it('adds milliseconds and checks expiry', () => {
    const deadline = addMs(base, 5 * MS.minute);
    expect(isExpired(deadline, addMs(base, 4 * MS.minute))).toBe(false);
    expect(isExpired(deadline, addMs(base, 6 * MS.minute))).toBe(true);
  });

  it('formats Lagos time as UTC+1 in 12-hour form', () => {
    expect(formatLagosTime(base)).toMatch(/^1:00\s?PM$/);
  });

  it('rounds minutes up and never goes negative', () => {
    expect(minutesUntil(addMs(base, 61 * MS.second), base)).toBe(2);
    expect(minutesUntil(base, addMs(base, MS.hour))).toBe(0);
  });
});
