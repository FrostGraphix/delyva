import type { RiderLocationBroadcast } from '@delyva/contracts';
import { orderingKeys, RealtimeClient } from '@delyva/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSession } from '../auth/session-store';
import { config } from '../config';

let shared: RealtimeClient | null = null;

/** Lazily opens one Socket.IO connection per signed-in session. */
function realtime(): RealtimeClient {
  shared ??= new RealtimeClient({
    url: config.apiUrl,
    accessToken: () => useSession.getState().accessToken,
  });
  return shared;
}

/** Closes the socket (sign-out). */
export function closeRealtime(): void {
  shared?.close();
  shared = null;
}

/** Live state for one order room. */
export interface OrderLive {
  /** Socket connected: when false, screens poll every 10 s. */
  readonly connected: boolean;
  readonly riderLocation: RiderLocationBroadcast | null;
}

/**
 * Joins the order's room, refetches the order on every `order:status` push and exposes the
 * rider's live location. Falls back to polling (caller) while disconnected.
 */
export function useOrderLive(orderId: string): OrderLive {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [riderLocation, setRider] = useState<RiderLocationBroadcast | null>(null);
  useEffect(() => {
    const rt = realtime();
    const join = (): void => {
      setConnected(true);
      void rt.joinOrder(orderId);
    };
    const drop = (): void => {
      setConnected(false);
    };
    if (rt.socket.connected) join();
    rt.socket.on('connect', join);
    rt.socket.on('disconnect', drop);
    const offStatus = rt.onOrderStatus((p) => {
      if (p.orderId === orderId)
        void qc.invalidateQueries({ queryKey: orderingKeys.order(orderId) });
    });
    const offRider = rt.onRiderLocation((p) => {
      if (p.orderId === orderId) setRider(p);
    });
    return () => {
      offStatus();
      offRider();
      rt.socket.off('connect', join);
      rt.socket.off('disconnect', drop);
      void rt.leaveOrder(orderId);
    };
  }, [orderId, qc]);
  return { connected, riderLocation };
}
