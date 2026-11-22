import { tokens } from './generated/tokens.js';

export { tokens };

/** Colour scheme name. */
export type ColorScheme = 'light' | 'dark';

/** Brand accent theme: `green` is the Delyva lime (default), `orange` the warm alternative. */
export type AccentName = 'green' | 'orange';

/** All accent themes, in display order. */
export const ACCENTS: readonly AccentName[] = ['green', 'orange'];

/** The accent used when the user has not chosen one. */
export const DEFAULT_ACCENT: AccentName = 'green';

/** Semantic colour roles available in both themes. */
export type ThemeColors = (typeof tokens.theme)['light'];

/** The accent scale (100 tint, 500 brand, 600 pressed, 700 text-on-light). */
export type AccentScale = Record<'100' | '500' | '600' | '700', string>;

/** True when `value` is a known accent name (use to validate persisted or URL input). */
export function isAccentName(value: unknown): value is AccentName {
  return typeof value === 'string' && (ACCENTS as readonly string[]).includes(value);
}

/** Returns the semantic palette for a colour scheme, with the brand roles taken from `accent`. */
export function themeColors(
  scheme: ColorScheme,
  accent: AccentName = DEFAULT_ACCENT,
): Record<keyof ThemeColors, string> {
  return { ...tokens.theme[scheme], ...tokens.accent[accent][scheme] };
}

/** Returns the accent scale for an accent theme. */
export function accentScale(accent: AccentName = DEFAULT_ACCENT): AccentScale {
  return { ...tokens.accent[accent].scale };
}
