import { type ColorScheme, themeColors } from '@delyva/design-tokens';
import { useColorScheme } from 'react-native';

/** Semantic palette for the active scheme (keys from design tokens). */
export type Palette = ReturnType<typeof themeColors>;

/** Current OS colour scheme, normalised to light/dark. */
export function useScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

/** Semantic token colours for the current scheme. */
export function usePalette(): Palette {
  return themeColors(useScheme());
}
