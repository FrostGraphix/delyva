import { tokens } from './generated/tokens.js';

export { tokens };

/** Colour scheme name. */
export type ColorScheme = 'light' | 'dark';

/** Semantic colour roles available in both themes. */
export type ThemeColors = (typeof tokens.theme)['light'];

/** Returns the semantic palette for a colour scheme. */
export function themeColors(scheme: ColorScheme): Record<keyof ThemeColors, string> {
  return tokens.theme[scheme];
}
