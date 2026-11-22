import { type ColorScheme, themeColors } from '@delyva/design-tokens';
import { useColorScheme } from 'react-native';

/** Current colour scheme (light unless the OS reports dark). */
export function useRiderScheme(): ColorScheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

/** Semantic token palette for the current OS colour scheme. */
export function useThemeColors(): ReturnType<typeof themeColors> {
  return themeColors(useRiderScheme());
}
