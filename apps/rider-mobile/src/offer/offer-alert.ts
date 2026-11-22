import { createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro asset reference
const CHIME = require('../../assets/offer-chime.wav') as number;

/** Plays the offer chime and a strong haptic; failures (no audio focus, web autoplay) are ignored. */
export function alertNewOffer(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  try {
    const player = createAudioPlayer(CHIME);
    player.play();
    setTimeout(() => {
      player.remove();
    }, 2_000);
  } catch {
    // Sound is a nice-to-have; the full-screen offer is the primary signal.
  }
}

/** Light confirmation haptic (accept, delivered). */
export function confirmHaptic(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
