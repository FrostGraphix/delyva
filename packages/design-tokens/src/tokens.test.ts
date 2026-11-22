import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  DEFAULT_ACCENT,
  accentScale,
  isAccentName,
  themeColors,
  tokens,
  type AccentName,
  type ColorScheme,
} from './index.js';

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

const SCHEMES: ColorScheme[] = ['light', 'dark'];

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

describe('accent themes', () => {
  it('offers green (default) and orange', () => {
    expect([...ACCENTS]).toEqual(['green', 'orange']);
    expect(DEFAULT_ACCENT).toBe('green');
  });

  it('keeps green identical to the original brand palette', () => {
    expect(themeColors('light', 'green').primary).toBe('#8CC63F');
    expect(themeColors('light')).toEqual(themeColors('light', 'green'));
  });

  it('uses the orange sampled from the reference kit', () => {
    expect(themeColors('light', 'orange').primary).toBe('#FF7A1A');
    expect(accentScale('orange')['500']).toBe('#FF7A1A');
  });

  it('only changes brand roles, never semantic status colours', () => {
    for (const scheme of SCHEMES) {
      const green = themeColors(scheme, 'green');
      const orange = themeColors(scheme, 'orange');
      for (const role of ['success', 'warning', 'danger', 'info', 'bg', 'surface', 'text'] as const) {
        expect(orange[role]).toBe(green[role]);
      }
    }
  });

  it.each(ACCENTS.flatMap((a) => SCHEMES.map((s) => [a, s] as const)))(
    '%s/%s: text on primary and accent text meet WCAG AA',
    (accent: AccentName, scheme: ColorScheme) => {
      const c = themeColors(scheme, accent);
      expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.accentText, c.surface)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('validates persisted accent names', () => {
    expect(isAccentName('orange')).toBe(true);
    expect(isAccentName('purple')).toBe(false);
    expect(isAccentName(undefined)).toBe(false);
  });
});
