import { usePalette, useScheme } from '@delyva/ui-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactElement, useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../src/api/query-client';
import { useSession } from '../src/auth/session-store';

/** Root: providers (query cache, safe area), session hydration and the stack navigator. */
export default function RootLayout(): ReactElement {
  const scheme = useScheme();
  const c = usePalette();
  useEffect(() => {
    void useSession.getState().hydrate();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Screen name="vendor/[id]" />
          <Stack.Screen name="login" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
