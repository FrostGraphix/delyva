import type {
  CreatePromo,
  FeeRuleList,
  Promo,
  PromoList,
  QuoteRequest,
  QuoteResponse,
  UpdatePromo,
} from '@delyva/contracts';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ApiError, DelyvaClient } from './client.js';

/** Query/mutation keys for pricing endpoints. */
export const pricingKeys = {
  all: ['pricing'] as const,
  quote: () => [...pricingKeys.all, 'quote'] as const,
  feeRules: () => [...pricingKeys.all, 'admin', 'fee-rules'] as const,
  promos: () => [...pricingKeys.all, 'admin', 'promos'] as const,
};

/** Prices the cart server-side (call on cart/address change; never compute totals on device). */
export function useCreateQuote(
  client: DelyvaClient,
): UseMutationResult<QuoteResponse, ApiError, QuoteRequest> {
  return useMutation({
    mutationKey: pricingKeys.quote(),
    mutationFn: (body) => client.createQuote(body),
  });
}

/** Admin: fee rules. */
export function useFeeRules(client: DelyvaClient): UseQueryResult<FeeRuleList, ApiError> {
  return useQuery({ queryKey: pricingKeys.feeRules(), queryFn: () => client.listFeeRules() });
}

/** Admin: promos with usage counters. */
export function usePromos(client: DelyvaClient): UseQueryResult<PromoList, ApiError> {
  return useQuery({ queryKey: pricingKeys.promos(), queryFn: () => client.listPromos() });
}

/** Admin: create a promo (pass a stable idempotency key per form submission). */
export function useCreatePromo(
  client: DelyvaClient,
): UseMutationResult<Promo, ApiError, CreatePromo & { idempotencyKey?: string }> {
  return useMutation({
    mutationKey: [...pricingKeys.promos(), 'create'],
    mutationFn: ({ idempotencyKey, ...body }) => client.createPromo(body, idempotencyKey),
  });
}

/** Admin: patch a promo. */
export function useUpdatePromo(
  client: DelyvaClient,
): UseMutationResult<Promo, ApiError, { id: string; patch: UpdatePromo }> {
  return useMutation({
    mutationKey: [...pricingKeys.promos(), 'update'],
    mutationFn: ({ id, patch }) => client.updatePromo(id, patch),
  });
}
