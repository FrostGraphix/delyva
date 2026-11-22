'use client';

import type { VendorApplication } from '@delyva/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { browserClient } from './api';

/** Query key for the caller's vendor application. */
export const APPLICATION_KEY = ['vendor-portal', 'application'] as const;

/** Loads the caller's vendor application. */
export function useApplication(): UseQueryResult<VendorApplication> {
  return useQuery({
    queryKey: APPLICATION_KEY,
    queryFn: () => browserClient().getMyVendorApplication(),
  });
}
