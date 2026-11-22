import type { DispatchOffer } from '@delyva/contracts';
import { RealtimeClient } from '@delyva/sdk';
import { create } from 'zustand';
import { API_URL } from '../config';
import { useSession } from '../session/session-store';

/** Socket connection + the offer currently shown to the rider. */
interface RealtimeState {
  readonly connected: boolean;
  readonly offer: DispatchOffer | null;
  readonly setOffer: (offer: DispatchOffer | null) => void;
}

/** Realtime UI state. */
export const useRealtime = create<RealtimeState>((set) => ({
  connected: false,
  offer: null,
  setOffer: (offer) => {
    set({ offer });
  },
}));

let client: RealtimeClient | null = null;

/** The live socket client, if connected for a rider session. */
export function realtimeClient(): RealtimeClient | null {
  return client;
}

/** Opens the rider socket (idempotent); offers land in {@link useRealtime}. */
export function connectRealtime(): RealtimeClient {
  if (client) return client;
  const rc = new RealtimeClient({
    url: API_URL,
    accessToken: () => useSession.getState().accessToken,
  });
  rc.socket.on('connect', () => {
    useRealtime.setState({ connected: true });
  });
  rc.socket.on('disconnect', () => {
    useRealtime.setState({ connected: false });
  });
  rc.onDispatchOffer((offer) => {
    useRealtime.getState().setOffer(offer);
  });
  client = rc;
  return rc;
}

/** Closes the socket (sign-out, going offline). */
export function disconnectRealtime(): void {
  client?.close();
  client = null;
  useRealtime.setState({ connected: false, offer: null });
}
