import { useBatteryLevel } from 'expo-battery';

/** Converts expo-battery's 0–1 level (−1 = unknown) into a 0–100 integer, or null. */
export function batteryPercent(level: number): number | null {
  if (!Number.isFinite(level) || level < 0) return null;
  return Math.min(100, Math.max(0, Math.round(level * 100)));
}

/** Live battery percentage, or null when the device cannot report it. */
export function useBatteryPct(): number | null {
  return batteryPercent(useBatteryLevel());
}
