'use client';

import type { VendorDetail } from '@delyva/contracts';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { browserClient } from './api';

/** Query key for a vendor's catalog. */
export const vendorKey = (vendorId: string) => ['vendor-portal', 'vendor', vendorId] as const;

/**
 * The vendor's menu, branches and hours.
 * DEBT(catalog): reuses the public GET /v1/vendors/{id} (live vendors only) — no member-scoped menu read — add GET /v1/vendors/{id}/manage for draft/suspended vendors.
 */
export function useVendorDetail(vendorId: string): UseQueryResult<VendorDetail> {
  return useQuery({
    queryKey: vendorKey(vendorId),
    queryFn: () => browserClient().getVendor(vendorId),
  });
}

/**
 * Wraps a catalog write: passes a fresh idempotency key per call and refreshes the vendor menu
 * on success. Callers keep one key per user intent by passing it in.
 */
export function useCatalogWrite<V, R>(
  vendorId: string,
  write: (vars: V, idempotencyKey: string) => Promise<R>,
): UseMutationResult<R, Error, V & { readonly key: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars) => write(vars, vars.key),
    onSettled: () => qc.invalidateQueries({ queryKey: vendorKey(vendorId) }),
  });
}
