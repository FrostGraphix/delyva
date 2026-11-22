import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '../api/client';

/** Outcome of asking for notification permission. */
export type PushOutcome = 'granted' | 'denied' | 'unsupported';

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId;
}

/**
 * Asks for notification permission (only after the first order, CLAUDE.md onboarding step 5)
 * and registers the Expo push token with the API when available.
 */
export async function enablePush(): Promise<PushOutcome> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== Notifications.PermissionStatus.GRANTED) return 'denied';
  const id = projectId();
  // DEBT(push): token registration skipped without an EAS projectId — no EAS project yet — set extra.eas.projectId in app config.
  if (!id) return 'granted';
  const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await api.registerDevice({
    pushToken: token.data,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
  return 'granted';
}
