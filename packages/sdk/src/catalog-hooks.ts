import type {
  Address,
  AddressList,
  CreateAddress,
  DiscoverVendorsQuery,
  DiscoverVendorsResponse,
  MenuItem,
  ModifierOption,
  OpeningHoursResponse,
  ReplaceOpeningHours,
  UpdateAddress,
  UpdateMenuItem,
  VendorDetail,
} from '@delyva/contracts';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ApiError, DelyvaClient } from './client.js';

/** Query keys for catalog and geo resources (used for cache invalidation). */
export const catalogKeys = {
  all: ['catalog'] as const,
  discover: (q: DiscoverVendorsQuery) => [...catalogKeys.all, 'discover', q] as const,
  vendor: (vendorId: string) => [...catalogKeys.all, 'vendor', vendorId] as const,
  addresses: () => ['geo', 'addresses'] as const,
};

/** Optional idempotency key carried by write mutations (stable per user intent). */
type WithKey<T> = T & { idempotencyKey?: string };

/** Open vendors delivering to a point. Menus change slowly; cache 60 s for poor networks. */
export function useDiscoverVendors(
  client: DelyvaClient,
  query: DiscoverVendorsQuery | null,
): UseQueryResult<DiscoverVendorsResponse, ApiError> {
  return useQuery({
    queryKey: query ? catalogKeys.discover(query) : [...catalogKeys.all, 'discover', 'none'],
    queryFn: () => {
      if (!query) throw new Error('query disabled');
      return client.discoverVendors(query);
    },
    enabled: query !== null,
    staleTime: 60_000,
  });
}

/** A vendor with its menu. */
export function useVendor(
  client: DelyvaClient,
  vendorId: string,
): UseQueryResult<VendorDetail, ApiError> {
  return useQuery({
    queryKey: catalogKeys.vendor(vendorId),
    queryFn: () => client.getVendor(vendorId),
    staleTime: 60_000,
  });
}

/** The caller's saved addresses. */
export function useAddresses(client: DelyvaClient): UseQueryResult<AddressList, ApiError> {
  return useQuery({ queryKey: catalogKeys.addresses(), queryFn: () => client.listAddresses() });
}

/** Saves an address and refreshes the address list. */
export function useCreateAddress(
  client: DelyvaClient,
): UseMutationResult<Address, ApiError, WithKey<CreateAddress>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ idempotencyKey, ...body }) => client.createAddress(body, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.addresses() }),
  });
}

/** Updates an address. */
export function useUpdateAddress(
  client: DelyvaClient,
): UseMutationResult<Address, ApiError, WithKey<{ addressId: string; body: UpdateAddress }>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ addressId, body, idempotencyKey }) =>
      client.updateAddress(addressId, body, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.addresses() }),
  });
}

/** Deletes an address. */
export function useDeleteAddress(
  client: DelyvaClient,
): UseMutationResult<void, ApiError, WithKey<{ addressId: string }>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ addressId, idempotencyKey }) => client.deleteAddress(addressId, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.addresses() }),
  });
}

/** Vendor: edits a menu item and refreshes the vendor menu. */
export function useUpdateMenuItem(
  client: DelyvaClient,
  vendorId: string,
): UseMutationResult<MenuItem, ApiError, WithKey<{ itemId: string; body: UpdateMenuItem }>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, body, idempotencyKey }) =>
      client.updateMenuItem(vendorId, itemId, body, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.vendor(vendorId) }),
  });
}

/** Vendor: marks an item available / sold out. */
export function useSetItemAvailability(
  client: DelyvaClient,
  vendorId: string,
): UseMutationResult<MenuItem, ApiError, WithKey<{ itemId: string; available: boolean }>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, available, idempotencyKey }) =>
      client.setItemAvailability(vendorId, itemId, { available }, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.vendor(vendorId) }),
  });
}

/** Vendor: marks a modifier option available / sold out. */
export function useSetModifierOptionAvailability(
  client: DelyvaClient,
  vendorId: string,
): UseMutationResult<ModifierOption, ApiError, WithKey<{ optionId: string; available: boolean }>> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ optionId, available, idempotencyKey }) =>
      client.setModifierOptionAvailability(vendorId, optionId, { available }, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.vendor(vendorId) }),
  });
}

/** Vendor: replaces a branch's weekly opening hours. */
export function useReplaceOpeningHours(
  client: DelyvaClient,
  vendorId: string,
): UseMutationResult<
  OpeningHoursResponse,
  ApiError,
  WithKey<{ branchId: string; body: ReplaceOpeningHours }>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, body, idempotencyKey }) =>
      client.replaceOpeningHours(vendorId, branchId, body, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.vendor(vendorId) }),
  });
}
