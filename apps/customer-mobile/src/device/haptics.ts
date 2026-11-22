import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Haptic moments named in CLAUDE.md (add-to-cart, order placed, delivered). */
export type HapticMoment = 'addToCart' | 'orderPlaced' | 'delivered';

/** Fires a haptic; silently skipped on web or devices without a motor. */
export function haptic(moment: HapticMoment): void {
  if (Platform.OS === 'web') return;
  const run =
    moment === 'addToCart'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  run.catch(() => undefined);
}
