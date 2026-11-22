import NetInfo from '@react-native-community/netinfo';
import { ApiError } from '@delyva/sdk';
import { onlineManager, QueryClient } from '@tanstack/react-query';

// Pause queries/mutations while offline and resume (refetch) on reconnect.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((s) => {
    setOnline(s.isConnected !== false);
  }),
);

/** Client errors (4xx) are final; network/5xx errors are retried with backoff. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.problem.status < 500) return false;
  return failureCount < 3;
}

/** Shared TanStack Query client tuned for slow, flaky mobile networks. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      retryDelay: (n) => Math.min(1_000 * 2 ** n, 8_000) + Math.floor(Math.random() * 300),
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1_000,
      networkMode: 'offlineFirst',
    },
    mutations: { retry: false, networkMode: 'online' },
  },
});

/** Human-safe message for an API error (problem+json `detail`/`title`, never a stack). */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  return fallback;
}
