'use client';

import type { MyVendor } from '@delyva/contracts';
import { ApiError, listMyVendors } from '@delyva/sdk';
import { ToastProvider } from '@delyva/ui-web';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { browserClient, isUnauthorized } from './api';

const STORE_KEY = 'delyva.vendor.selected';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        retry: (count, err) => !isUnauthorized(err) && count < 2,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

/** App-wide providers: TanStack Query + toasts. */
export function Providers({ children }: { readonly children: ReactNode }): ReactNode {
  const [qc] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

/** Vendor context value. */
export interface VendorContextValue {
  readonly vendors: readonly MyVendor[];
  readonly vendor: MyVendor | null;
  readonly select: (id: string) => void;
}

const VendorContext = createContext<VendorContextValue | null>(null);

/** Query key for the caller's vendors. */
export const MY_VENDORS_KEY = ['vendor-portal', 'my-vendors'] as const;

/** Loads `/v1/me/vendors` (403 = not a vendor yet → empty list). */
export function useMyVendors(): ReturnType<typeof useQuery<readonly MyVendor[]>> {
  return useQuery({
    queryKey: MY_VENDORS_KEY,
    queryFn: async () => {
      try {
        return (await listMyVendors(browserClient())).items;
      } catch (err) {
        if (err instanceof ApiError && err.problem.status === 403) return [];
        throw err;
      }
    },
  });
}

/** Provides the selected vendor; selection is a per-browser convenience in localStorage. */
export function VendorProvider({
  vendors,
  children,
}: {
  readonly vendors: readonly MyVendor[];
  readonly children: ReactNode;
}): ReactNode {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSelected(window.localStorage.getItem(STORE_KEY));
    } catch {
      setSelected(null);
    }
  }, []);
  const value = useMemo<VendorContextValue>(() => {
    const vendor = vendors.find((v) => v.id === selected) ?? vendors[0] ?? null;
    return {
      vendors,
      vendor,
      select: (id) => {
        setSelected(id);
        try {
          window.localStorage.setItem(STORE_KEY, id);
        } catch {
          // Storage blocked (private mode): selection lasts for this tab only.
        }
      },
    };
  }, [vendors, selected]);
  return <VendorContext.Provider value={value}>{children}</VendorContext.Provider>;
}

/** Returns the vendor context. @throws outside {@link VendorProvider} */
export function useVendor(): VendorContextValue {
  const ctx = useContext(VendorContext);
  if (!ctx) throw new Error('useVendor must be used inside <VendorProvider>');
  return ctx;
}

/** The selected vendor. @throws when the user has no vendor (pages behind the shell guarantee one) */
export function useCurrentVendor(): MyVendor {
  const { vendor } = useVendor();
  if (!vendor) throw new Error('No vendor selected');
  return vendor;
}

function subscribeOnline(cb: () => void): () => void {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** Browser online status (SSR assumes online). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
