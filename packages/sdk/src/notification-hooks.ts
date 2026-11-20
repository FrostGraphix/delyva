import type {
  DeviceRegistration,
  ListNotificationsQuery,
  LocationBatchResult,
  NotificationPage,
  NotificationPreferences,
  RegisterDevice,
  RiderLocationBatch,
} from '@delyva/contracts';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ApiError } from './client.js';
import type { NotificationsClient } from './notifications.js';

/** Query keys for notifications. */
export const notificationKeys = {
  all: ['notifications'] as const,
  list: (q: ListNotificationsQuery = {}) => [...notificationKeys.all, 'list', q] as const,
  preferences: () => [...notificationKeys.all, 'preferences'] as const,
};

/** Inbox page (stale after 30 s; cached for offline reads). */
export function useNotifications(
  client: NotificationsClient,
  query: ListNotificationsQuery = {},
): UseQueryResult<NotificationPage, ApiError> {
  return useQuery({
    queryKey: notificationKeys.list(query),
    queryFn: () => client.listNotifications(query),
    staleTime: 30_000,
  });
}

/** Marks a notification read and refreshes the inbox. */
export function useMarkNotificationRead(
  client: NotificationsClient,
): UseMutationResult<void, ApiError, string> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => client.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

/** Effective notification preferences. */
export function useNotificationPreferences(
  client: NotificationsClient,
): UseQueryResult<NotificationPreferences, ApiError> {
  return useQuery({
    queryKey: notificationKeys.preferences(),
    queryFn: () => client.getNotificationPreferences(),
  });
}

/** Updates preferences and stores the returned matrix in the cache. */
export function useUpdateNotificationPreferences(
  client: NotificationsClient,
): UseMutationResult<NotificationPreferences, ApiError, NotificationPreferences> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => client.updateNotificationPreferences(body),
    onSuccess: (data) => {
      qc.setQueryData(notificationKeys.preferences(), data);
    },
  });
}

/** Registers the device's Expo push token (call after the OS permission is granted). */
export function useRegisterDevice(
  client: NotificationsClient,
): UseMutationResult<DeviceRegistration, ApiError, RegisterDevice> {
  return useMutation({ mutationFn: (body) => client.registerDevice(body) });
}

/** Sends a batch of queued rider locations over HTTP (socket fallback). */
export function usePostRiderLocations(
  client: NotificationsClient,
): UseMutationResult<LocationBatchResult, ApiError, RiderLocationBatch> {
  return useMutation({ mutationFn: (body) => client.postRiderLocations(body) });
}
