import { describe, expect, it } from 'vitest';
import { themeColors, tokens } from './index.js';

describe('design tokens', () => {
  it('carries the brand colours from docs/07', () => {
    expect(tokens.color.brand.primary).toBe('#8CC63F');
    expect(tokens.color.brand.ink).toBe('#0B0F0A');
  });

  it('defines the same semantic roles for light and dark', () => {
    expect(Object.keys(themeColors('dark')).sort()).toEqual(
      Object.keys(themeColors('light')).sort(),
    );
  });

  it('keeps spacing on the 4-pt grid', () => {
    expect(Object.values(tokens.space).every((v) => v % 4 === 0)).toBe(true);
  });
});
