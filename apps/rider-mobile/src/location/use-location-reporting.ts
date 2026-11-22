import * as Location from 'expo-location';
import { useEffect } from 'react';
import { api } from '../api/client';
import { IDLE_LOCATION_INTERVAL_MS, TRIP_LOCATION_INTERVAL_MS } from '../config';
import { realtimeClient } from '../realtime/realtime-store';
import { LocationReporter } from './location-reporter';
import { toFix, useLocationStore } from './location-store';

const reporter = new LocationReporter({
  socketConnected: () => realtimeClient()?.socket.connected ?? false,
  sendSocket: (fix) => {
    const rc = realtimeClient();
    return rc ? rc.sendLocation(fix) : Promise.resolve({ ok: false, code: 'internal_error' });
  },
  sendBatch: (points) => api.postRiderLocations({ points }),
});

/**
 * While `enabled` (rider online), watches the foreground position and reports the latest fix
 * every 4.5 s on a trip or 30 s when idle (socket first, HTTP batch fallback).
 * DEBT(location): foreground only — background updates need expo-task-manager + a dev build — add with the EAS dev client.
 */
export function useLocationReporting(enabled: boolean, onTrip: boolean): void {
  const granted = useLocationStore((s) => s.permission === 'granted');
  useEffect(() => {
    if (!enabled || !granted) return undefined;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 4_000, distanceInterval: 0 },
      (p) => {
        useLocationStore.setState({ latest: toFix(p) });
      },
    ).then((s) => {
      if (cancelled) s.remove();
      else sub = s;
    });
    const tick = (): void => {
      const fix = useLocationStore.getState().latest;
      if (fix) void reporter.report(fix);
    };
    tick();
    const timer = setInterval(tick, onTrip ? TRIP_LOCATION_INTERVAL_MS : IDLE_LOCATION_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub?.remove();
    };
  }, [enabled, granted, onTrip]);
}
