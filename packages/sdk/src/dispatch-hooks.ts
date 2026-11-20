import type {
  AdminDispatchRiderList,
  CurrentTrip,
  DispatchOffer,
  ManualAssign,
  RiderEarnings,
  RiderProfile,
  Trip,
} from '@delyva/contracts';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ApiError, DelyvaClient, TripActionBodies, TripActionSegment } from './client.js';

/** Query keys for dispatch. */
export const dispatchKeys = {
  all: ['dispatch'] as const,
  me: () => [...dispatchKeys.all, 'me'] as const,
  currentTrip: () => [...dispatchKeys.all, 'me', 'current-trip'] as const,
  earnings: () => [...dispatchKeys.all, 'me', 'earnings'] as const,
  adminRiders: () => [...dispatchKeys.all, 'admin', 'riders'] as const,
};

/** Rider profile and status. */
export function useMyRiderProfile(client: DelyvaClient): UseQueryResult<RiderProfile, ApiError> {
  return useQuery({ queryKey: dispatchKeys.me(), queryFn: () => client.getMyRiderProfile() });
}

/** Active trip (null when idle); refetched every 15 s as a socket fallback. */
export function useMyCurrentTrip(client: DelyvaClient): UseQueryResult<CurrentTrip, ApiError> {
  return useQuery({
    queryKey: dispatchKeys.currentTrip(),
    queryFn: () => client.getMyCurrentTrip(),
    refetchInterval: 15_000,
  });
}

/** Earnings summary (placeholder balance until payments exposes it). */
export function useMyRiderEarnings(client: DelyvaClient): UseQueryResult<RiderEarnings, ApiError> {
  return useQuery({
    queryKey: dispatchKeys.earnings(),
    queryFn: () => client.getMyRiderEarnings(),
  });
}

/** Toggles availability; `online: true` goes online. */
export function useSetRiderAvailability(
  client: DelyvaClient,
): UseMutationResult<RiderProfile, ApiError, { online: boolean; batteryPct: number }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ online, batteryPct }) =>
      online ? client.goOnline(batteryPct) : client.goOffline(batteryPct),
    onSuccess: (profile) => {
      qc.setQueryData(dispatchKeys.me(), profile);
    },
  });
}

/** Accepts or declines an offer received over the socket. */
export function useRespondToOffer(
  client: DelyvaClient,
): UseMutationResult<Trip | DispatchOffer, ApiError, { offerId: string; accept: boolean }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId, accept }): Promise<Trip | DispatchOffer> =>
      accept ? client.acceptDispatchOffer(offerId) : client.declineDispatchOffer(offerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: dispatchKeys.all }),
  });
}

/** Runs a trip action; pass a stable `idempotencyKey` for offline-queued replays. */
export function useTripAction<S extends TripActionSegment>(
  client: DelyvaClient,
  action: S,
): UseMutationResult<
  Trip,
  ApiError,
  { tripId: string; body: TripActionBodies[S]; idempotencyKey?: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [...dispatchKeys.all, 'trip-action', action],
    mutationFn: ({ tripId, body, idempotencyKey }) =>
      client.tripAction(tripId, action, body, idempotencyKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: dispatchKeys.currentTrip() }),
  });
}

/** Ops: online riders with positions. */
export function useDispatchRiders(
  client: DelyvaClient,
): UseQueryResult<AdminDispatchRiderList, ApiError> {
  return useQuery({
    queryKey: dispatchKeys.adminRiders(),
    queryFn: () => client.listDispatchRiders(),
    refetchInterval: 10_000,
  });
}

/** Ops: manual dispatch override (reason required). */
export function useManualAssign(
  client: DelyvaClient,
): UseMutationResult<Trip, ApiError, ManualAssign & { orderId: string }> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, ...body }) => client.manuallyAssignOrder(orderId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: dispatchKeys.adminRiders() }),
  });
}
