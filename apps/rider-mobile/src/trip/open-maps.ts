import type { DispatchPoint } from '@delyva/contracts';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { mapsUrl, webMapsUrl } from './maps';

/** Opens the platform maps app for directions; falls back to the Google Maps web URL. */
export async function openMaps(to: DispatchPoint): Promise<void> {
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
  const url = mapsUrl(to, platform);
  if (platform === 'web') {
    // expo-linking navigates the current tab on web, which would drop the active trip screen.
    window.open(url, '_blank', 'noopener');
    return;
  }
  try {
    if (!(await Linking.canOpenURL(url))) {
      await Linking.openURL(webMapsUrl(to));
      return;
    }
    await Linking.openURL(url);
  } catch {
    await Linking.openURL(webMapsUrl(to));
  }
}
