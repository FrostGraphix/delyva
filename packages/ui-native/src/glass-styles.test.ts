import { describe, expect, it } from 'vitest';
import { glassStyleSpec, withAlpha } from './glass-styles.js';

describe('withAlpha', () => {
  it('appends a two-digit alpha to a token hex and clamps out-of-range values', () => {
    expect(withAlpha('#FFFFFF', 0.5)).toBe('#FFFFFF80');
    expect(withAlpha('#0B0F0A', 2)).toBe('#0B0F0AFF');
    expect(withAlpha('#0B0F0A', -1)).toBe('#0B0F0A00');
  });

  it('rejects non-token colours', () => {
    expect(() => withAlpha('red', 0.5)).toThrow(/expected #RRGGBB/);
  });
});

describe('glassStyleSpec', () => {
  it('is translucent by default and solid as the fallback', () => {
    expect(glassStyleSpec('light').backgroundColor).toBe('#FFFFFF9E');
    expect(glassStyleSpec('light', true).backgroundColor).toBe('#FFFFFF');
    expect(glassStyleSpec('dark').backgroundColor).toBe('#161B14B8');
  });
});
