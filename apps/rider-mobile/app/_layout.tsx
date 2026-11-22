import { themeColors } from '@delyva/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactElement, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isRetryable } from '../src/api/errors';
import { RiderRuntime } from '../src/runtime/rider-runtime';
import { useSession } from '../src/session/session-store';

/** Query client tuned for poor networks: retry only what can succeed later. */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (count, err) => count < 2 && isRetryable(err),
        networkMode: 'offlineFirst',
      },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}

/** Root: providers, session hydration, rider runtime and the stack navigator. */
export default function RootLayout(): ReactElement {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = themeColors(scheme);
  const [client] = useState(makeQueryClient);
  const hydrate = useSession((s) => s.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <RiderRuntime />
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
        />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
