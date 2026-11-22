import { dispatchKeys, useMyCurrentTrip, useMyRiderProfile } from '@delyva/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactElement, useEffect } from 'react';
import { api } from '../api/client';
import { syncLocationPermission } from '../location/location-store';
import { useLocationReporting } from '../location/use-location-reporting';
import { alertNewOffer } from '../offer/offer-alert';
import { replayTripActions } from '../offline/trip-actions';
import { useOnline } from '../offline/use-online';
import { connectRealtime, disconnectRealtime, useRealtime } from '../realtime/realtime-store';
import { isRider, useSession } from '../session/session-store';

/** Replays the offline trip-action queue on start and whenever the device reconnects. */
function useQueueReplay(): void {
  const online = useOnline();
  const qc = useQueryClient();
  useEffect(() => {
    if (!online) return;
    void replayTripActions().then((r) => {
      if (r.sent.length > 0) void qc.invalidateQueries({ queryKey: dispatchKeys.all });
    });
  }, [online, qc]);
}

/** Rider-only background work: socket, offers, location reporting, queue replay. */
function RiderSession(): ReactElement | null {
  const profile = useMyRiderProfile(api);
  const trip = useMyCurrentTrip(api);
  const offer = useRealtime((s) => s.offer);
  const status = profile.data?.status ?? 'offline';
  useEffect(() => {
    connectRealtime();
    void syncLocationPermission().catch(() => undefined);
    return disconnectRealtime;
  }, []);
  useEffect(() => {
    if (offer?.status !== 'pending') return;
    alertNewOffer();
    router.push('/offer');
  }, [offer]);
  useLocationReporting(status !== 'offline', (trip.data?.trip ?? null) !== null);
  useQueueReplay();
  return null;
}

/** Mounts rider background work only for sessions with the `rider` role. */
export function RiderRuntime(): ReactElement | null {
  const rider = useSession((s) => s.status === 'signedIn' && isRider(s.roles));
  return rider ? <RiderSession /> : null;
}
