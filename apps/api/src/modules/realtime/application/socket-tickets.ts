import type { AuthPrincipal } from '../../../shared/auth/auth.guard.js';

/** Ticket lifetime: long enough for a handshake on 3G, short enough to be useless if leaked. */
export const SOCKET_TICKET_TTL_SECONDS = 60;
/** Ticket mint limit per user per minute. */
export const SOCKET_TICKET_LIMIT = { limit: 20, windowSeconds: 60 } as const;

/** Port: single-use ticket storage. */
export interface SocketTicketStore {
  /** Stores the principal under the ticket for `ttlSeconds`. */
  put(ticket: string, principal: AuthPrincipal, ttlSeconds: number): Promise<void>;
  /** Atomically reads and deletes a ticket; null when unknown, used or expired. */
  take(ticket: string): Promise<AuthPrincipal | null>;
}

/**
 * Issues and redeems Socket.IO handshake tickets for cookie-session web clients (ADR 0820): the
 * browser never holds the access JWT, so its server layer mints a ticket and hands only that over.
 */
export class SocketTickets {
  /** @param store ticket store @param random random ticket generator (hex, >= 32 chars) */
  constructor(
    private readonly store: SocketTicketStore,
    private readonly random: () => string,
  ) {}

  /** Mints a ticket bound to the principal. */
  async issue(principal: AuthPrincipal): Promise<{ ticket: string; expiresInSeconds: number }> {
    const ticket = this.random();
    await this.store.put(ticket, principal, SOCKET_TICKET_TTL_SECONDS);
    return { ticket, expiresInSeconds: SOCKET_TICKET_TTL_SECONDS };
  }

  /** Redeems a ticket once; malformed tickets never reach the store. */
  redeem(ticket: string): Promise<AuthPrincipal | null> {
    if (!/^[a-f0-9]{32,128}$/.test(ticket)) return Promise.resolve(null);
    return this.store.take(ticket);
  }
}
