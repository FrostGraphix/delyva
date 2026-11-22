import type { RiderLocationInput } from '@delyva/contracts';
import * as Location from 'expo-location';
import { create } from 'zustand';

/** Foreground permission state as the UI needs it. */
export type LocationPermission = 'unknown' | 'granted' | 'denied';

interface LocationState {
  readonly permission: LocationPermission;
  readonly latest: RiderLocationInput | null;
}

/** Latest device fix (also attached to trip actions for the server GPS check). */
export const useLocationStore = create<LocationState>(() => ({
  permission: 'unknown',
  latest: null,
}));

/** Converts an expo-location fix into the contract shape. */
export function toFix(p: Location.LocationObject): RiderLocationInput {
  const h = p.coords.heading;
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    heading: h !== null && h >= 0 && h < 360 ? h : null,
    ts: Math.round(p.timestamp),
  };
}

/** Asks for foreground location (after the in-app priming copy) and records the answer. */
export async function requestLocationPermission(): Promise<LocationPermission> {
  const res = await Location.requestForegroundPermissionsAsync();
  const permission: LocationPermission = res.granted ? 'granted' : 'denied';
  useLocationStore.setState({ permission });
  return permission;
}

/** Reads one fresh fix (used right before going online and trip actions). */
export async function currentFix(): Promise<RiderLocationInput | null> {
  try {
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const fix = toFix(p);
    useLocationStore.setState({ latest: fix });
    return fix;
  } catch {
    return useLocationStore.getState().latest;
  }
}

/** Reads the current permission without prompting (app start, resume). */
export async function syncLocationPermission(): Promise<void> {
  const res = await Location.getForegroundPermissionsAsync();
  const permission: LocationPermission = res.granted
    ? 'granted'
    : res.canAskAgain
      ? 'unknown'
      : 'denied';
  useLocationStore.setState({ permission });
}
