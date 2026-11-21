'use client';

import type { OrderStatusBroadcast } from '@delyva/contracts';
import { createRealtimeTicket, RealtimeClient } from '@delyva/sdk';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { browserClient } from './api';

/** Realtime origin (the API) exposed to the browser; unset = polling only. */
const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? '';

/**
 * Socket factory that authenticates each (re)connect with a fresh single-use ticket minted by the
 * BFF (ADR 0820), so the browser never holds the access JWT. WebSocket transport only: the API
 * does not serve CORS for long-polling.
 */
const ticketConnect = ((url: string, opts: Parameters<typeof io>[1]) =>
  io(url, {
    ...opts,
    transports: ['websocket'],
    auth: (cb: (data: object) => void) => {
      createRealtimeTicket(browserClient()).then(
        (t) => {
          cb({ ticket: t.ticket });
        },
        () => {
          cb({});
        },
      );
    },
  })) as unknown as typeof io; // Narrower signature than io's overloads; only (url, opts) is used.

/**
 * Joins the rooms of the given orders and calls `onStatus` on every `order:status` event.
 * Returns whether the socket is connected; callers poll REST while it is not.
 */
export function useOrderRealtime(
  orderIds: readonly string[],
  onStatus: (p: OrderStatusBroadcast) => void,
): boolean {
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<RealtimeClient | null>(null);
  const handler = useRef(onStatus);
  handler.current = onStatus;

  useEffect(() => {
    if (!REALTIME_URL) return undefined;
    const rt = new RealtimeClient({
      url: REALTIME_URL,
      accessToken: () => null,
      connect: ticketConnect,
    });
    clientRef.current = rt;
    const up = (): void => {
      setConnected(true);
    };
    const down = (): void => {
      setConnected(false);
    };
    rt.socket.on('connect', up);
    rt.socket.on('disconnect', down);
    rt.socket.on('connect_error', down);
    const off = rt.onOrderStatus((p) => {
      handler.current(p);
    });
    return () => {
      off();
      rt.close();
      clientRef.current = null;
    };
  }, []);

  const key = orderIds.join(',');
  useEffect(() => {
    const rt = clientRef.current;
    if (!rt || !connected) return;
    for (const id of key.split(',').filter(Boolean)) void rt.joinOrder(id);
  }, [key, connected]);

  return connected;
}
