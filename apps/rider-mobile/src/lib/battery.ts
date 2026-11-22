import { useBatteryLevel } from 'expo-battery';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** Converts expo-battery's 0–1 level (−1 = unknown) into a 0–100 integer, or null. */
export function batteryPercent(level: number): number | null {
  if (!Number.isFinite(level) || level < 0) return null;
  return Math.min(100, Math.max(0, Math.round(level * 100)));
}

/** Subset of the Battery Status API used on the web target. */
interface WebBattery {
  readonly level: number;
  addEventListener(type: 'levelchange', listener: () => void): void;
  removeEventListener(type: 'levelchange', listener: () => void): void;
}

const webNavigator = (): { getBattery?: () => Promise<WebBattery> } | undefined =>
  (globalThis as unknown as { navigator?: { getBattery?: () => Promise<WebBattery> } }).navigator;

/** Web: expo-battery's web module has no event emitter, so read the Battery Status API directly. */
function useWebBatteryLevel(): number {
  const [level, setLevel] = useState(-1);
  useEffect(() => {
    let battery: WebBattery | null = null;
    let live = true;
    const update = (): void => {
      if (live && battery) setLevel(battery.level);
    };
    void webNavigator()
      ?.getBattery?.()
      .then((b) => {
        battery = b;
        update();
        b.addEventListener('levelchange', update);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      battery?.removeEventListener('levelchange', update);
    };
  }, []);
  return level;
}

/** Live battery level (0–1, −1 unknown); the platform is constant so the hook order is stable. */
const useLevel = Platform.OS === 'web' ? useWebBatteryLevel : useBatteryLevel;

/** Live battery percentage, or null when the device cannot report it. */
export function useBatteryPct(): number | null {
  return batteryPercent(useLevel());
}
