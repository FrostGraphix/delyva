import { themeColors } from '@delyva/design-tokens';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactElement } from 'react';
import { useColorScheme } from 'react-native';

/** Root navigator; background follows the light/dark token theme. */
export default function RootLayout(): ReactElement {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = themeColors(scheme);
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </>
  );
}
