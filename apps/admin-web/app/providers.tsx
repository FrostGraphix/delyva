'use client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { authRedirectFor, isClientError } from '@/lib/client/errors';
import { ToastProvider } from '@/lib/client/toasts';

function onAuthError(error: unknown): void {
  const target = authRedirectFor(error);
  if (target && !window.location.pathname.startsWith('/login')) window.location.assign(target);
}

function makeClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: onAuthError }),
    mutationCache: new MutationCache({ onError: onAuthError }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (count, error) => !isClientError(error) && count < 2,
        networkMode: 'offlineFirst',
      },
      mutations: { retry: false },
    },
  });
}

/** Client providers: TanStack Query (with auth redirects) and toasts. */
export function Providers({ children }: { readonly children: ReactNode }): ReactNode {
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
