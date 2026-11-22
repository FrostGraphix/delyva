import {
  type MyVendorList,
  MyVendorListSchema,
  type RealtimeTicket,
  RealtimeTicketSchema,
  ROUTES,
} from '@delyva/contracts';
import type { DelyvaClient } from './client.js';

/** GET /v1/me/vendors — vendors the caller owns or staffs (vendor portal bootstrap). */
export function listMyVendors(client: DelyvaClient): Promise<MyVendorList> {
  return client.request('GET', ROUTES.listMyVendors.path, undefined, MyVendorListSchema);
}

/**
 * POST /v1/realtime/tickets — a 60 s single-use Socket.IO handshake ticket. Used by cookie-session
 * web clients whose browser code never sees the access token (ADR 0820).
 */
export function createRealtimeTicket(client: DelyvaClient): Promise<RealtimeTicket> {
  return client.request('POST', ROUTES.createRealtimeTicket.path, undefined, RealtimeTicketSchema);
}
