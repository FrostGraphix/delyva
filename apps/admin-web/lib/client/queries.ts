'use client';
import type {
  AdminCancelOrder,
  ApplicationStatus,
  CreatePromo,
  CreateSurgeRule,
  FeatureFlagList,
  ListAdminOrdersQuery,
  ManualAssign,
  OrderPage,
  ReviewDecision,
  SurgeRuleList,
  UpdateFeeRule,
  UpdatePromo,
  UpdateSurgeRule,
  UpsertFeatureFlag,
} from '@delyva/contracts';
import { pricingKeys, type ApiError } from '@delyva/sdk';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { adminClient } from './api';

/** Query keys owned by the console. */
export const adminKeys = {
  orders: (q: ListAdminOrdersQuery) => ['admin', 'orders', q] as const,
  ordersAll: ['admin', 'orders'] as const,
  surge: ['admin', 'surge-rules'] as const,
  flags: ['admin', 'feature-flags'] as const,
  riderApps: (s: ApplicationStatus) => ['admin', 'rider-applications', s] as const,
  vendorApps: (s: ApplicationStatus) => ['admin', 'vendor-applications', s] as const,
  dispatchRiders: ['admin', 'dispatch', 'riders'] as const,
};

/** Live refresh interval for ops screens (poor-network friendly). */
export const LIVE_REFRESH_MS = 10_000;

type ReviewStatus = Exclude<ApplicationStatus, 'not_started'>;

/** GET /v1/admin/orders. */
export function useAdminOrders(
  q: ListAdminOrdersQuery,
  live = false,
): UseQueryResult<OrderPage, ApiError> {
  return useQuery({
    queryKey: adminKeys.orders(q),
    queryFn: () => adminClient.ordering.listAdminOrders(q),
    refetchInterval: live ? LIVE_REFRESH_MS : false,
  });
}

/** GET /v1/admin/dispatch/riders. */
export function useOpsRiders(enabled = true) {
  return useQuery({
    queryKey: adminKeys.dispatchRiders,
    queryFn: () => adminClient.listDispatchRiders(),
    refetchInterval: LIVE_REFRESH_MS,
    enabled,
  });
}

/** POST /v1/admin/orders/{id}/cancel. */
export function useOpsCancelOrder(
  id: string,
): UseMutationResult<unknown, ApiError, AdminCancelOrder> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AdminCancelOrder) => adminClient.ordering.adminCancelOrder(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.ordersAll }),
  });
}

/** POST /v1/admin/dispatch/orders/{orderId}/assign. */
export function useOpsAssign(orderId: string): UseMutationResult<unknown, ApiError, ManualAssign> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ManualAssign) => adminClient.manuallyAssignOrder(orderId, body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: adminKeys.ordersAll });
      await qc.invalidateQueries({ queryKey: adminKeys.dispatchRiders });
    },
  });
}

/** GET /v1/admin/rider-applications. */
export function useRiderApps(status: ReviewStatus, enabled = true) {
  return useQuery({
    queryKey: adminKeys.riderApps(status),
    queryFn: () => adminClient.listRiderApplications(status),
    enabled,
  });
}

/** GET /v1/admin/vendor-applications. */
export function useVendorApps(status: ReviewStatus, enabled = true) {
  return useQuery({
    queryKey: adminKeys.vendorApps(status),
    queryFn: () => adminClient.listVendorApplications(status),
    enabled,
  });
}

/** Decision on a rider or vendor application. */
export interface Decision {
  readonly id: string;
  readonly decision: 'approve' | 'reject';
  readonly body: ReviewDecision;
}

/** POST /v1/admin/{rider|vendor}-applications/{id}/approve|reject. */
export function useDecideApplication(
  kind: 'rider' | 'vendor',
): UseMutationResult<unknown, ApiError, Decision> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: Decision): Promise<unknown> =>
      kind === 'rider'
        ? adminClient.decideRiderApplication(d.id, d.decision, d.body)
        : adminClient.decideVendorApplication(d.id, d.decision, d.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', `${kind}-applications`] }),
  });
}

/** PATCH /v1/admin/fee-rules/{id}. */
export function useUpdateFeeRule(): UseMutationResult<
  unknown,
  ApiError,
  { id: string; body: UpdateFeeRule }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: UpdateFeeRule }) => adminClient.updateFeeRule(v.id, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: pricingKeys.feeRules() }),
  });
}

/** GET /v1/admin/surge-rules. */
export function useSurgeRules(enabled = true): UseQueryResult<SurgeRuleList, ApiError> {
  return useQuery({
    queryKey: adminKeys.surge,
    queryFn: () => adminClient.listSurgeRules(),
    enabled,
  });
}

/** POST / PATCH surge rules. */
export function useSaveSurgeRule(): UseMutationResult<
  unknown,
  ApiError,
  { id: string; body: UpdateSurgeRule } | { id: null; body: CreateSurgeRule }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: UpdateSurgeRule } | { id: null; body: CreateSurgeRule }) =>
      v.id === null
        ? adminClient.createSurgeRule(v.body)
        : adminClient.updateSurgeRule(v.id, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.surge }),
  });
}

/** POST / PATCH promos. */
export function useSavePromo(): UseMutationResult<
  unknown,
  ApiError,
  { id: string; body: UpdatePromo } | { id: null; body: CreatePromo }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; body: UpdatePromo } | { id: null; body: CreatePromo }) =>
      v.id === null ? adminClient.createPromo(v.body) : adminClient.updatePromo(v.id, v.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: pricingKeys.promos() }),
  });
}

/** GET /v1/admin/feature-flags. */
export function useFlags(enabled = true): UseQueryResult<FeatureFlagList, ApiError> {
  return useQuery({
    queryKey: adminKeys.flags,
    queryFn: () => adminClient.listFeatureFlags(),
    enabled,
  });
}

/** PUT /v1/admin/feature-flags. */
export function useUpsertFlag(): UseMutationResult<unknown, ApiError, UpsertFeatureFlag> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertFeatureFlag) => adminClient.upsertFeatureFlag(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.flags }),
  });
}
