import type {
  AdminRiderApplicationList,
  AdminVendorApplicationList,
  ListApplicationsQuery,
  Quiz,
  RiderApplication,
  VendorApplication,
} from '@delyva/contracts';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ApiError, DelyvaClient, RiderStepBodies, VendorStepBodies } from './client.js';

/** Query keys for onboarding and admin review. */
export const onboardingKeys = {
  all: ['onboarding'] as const,
  rider: () => [...onboardingKeys.all, 'rider', 'me'] as const,
  vendor: () => [...onboardingKeys.all, 'vendor', 'me'] as const,
  quiz: () => [...onboardingKeys.all, 'rider', 'quiz'] as const,
  adminRiders: (status: string) => [...onboardingKeys.all, 'admin', 'riders', status] as const,
  adminVendors: (status: string) => [...onboardingKeys.all, 'admin', 'vendors', status] as const,
};

/** The rider's own application (resume point + review status). */
export function useMyRiderApplication(
  client: DelyvaClient,
): UseQueryResult<RiderApplication, ApiError> {
  return useQuery({
    queryKey: onboardingKeys.rider(),
    queryFn: () => client.getMyRiderApplication(),
  });
}

/** Saves one rider step and refreshes the application. */
export function useSaveRiderStep<K extends keyof RiderStepBodies>(
  client: DelyvaClient,
  step: K,
): UseMutationResult<RiderApplication, ApiError, RiderStepBodies[K]> {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...onboardingKeys.rider(), step],
    mutationFn: (body) => client.saveRiderStep(step, body),
    onSuccess: (data) => qc.setQueryData(onboardingKeys.rider(), data),
  });
}

/** Training quiz questions. */
export function useRiderQuiz(client: DelyvaClient): UseQueryResult<Quiz, ApiError> {
  return useQuery({ queryKey: onboardingKeys.quiz(), queryFn: () => client.getRiderQuiz() });
}

/** The vendor owner's own application. */
export function useMyVendorApplication(
  client: DelyvaClient,
): UseQueryResult<VendorApplication, ApiError> {
  return useQuery({
    queryKey: onboardingKeys.vendor(),
    queryFn: () => client.getMyVendorApplication(),
  });
}

/** Saves one vendor step and refreshes the application. */
export function useSaveVendorStep<K extends keyof VendorStepBodies>(
  client: DelyvaClient,
  step: K,
): UseMutationResult<VendorApplication, ApiError, VendorStepBodies[K]> {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...onboardingKeys.vendor(), step],
    mutationFn: (body) => client.saveVendorStep(step, body),
    onSuccess: (data) => qc.setQueryData(onboardingKeys.vendor(), data),
  });
}

/** Ops review queue (riders). Requires `adminTwoFactorToken` on the client. */
export function useRiderApplications(
  client: DelyvaClient,
  status: ListApplicationsQuery['status'] = 'pending_review',
): UseQueryResult<AdminRiderApplicationList, ApiError> {
  return useQuery({
    queryKey: onboardingKeys.adminRiders(status),
    queryFn: () => client.listRiderApplications(status),
  });
}

/** Ops review queue (vendors). */
export function useVendorApplications(
  client: DelyvaClient,
  status: ListApplicationsQuery['status'] = 'pending_review',
): UseQueryResult<AdminVendorApplicationList, ApiError> {
  return useQuery({
    queryKey: onboardingKeys.adminVendors(status),
    queryFn: () => client.listVendorApplications(status),
  });
}
