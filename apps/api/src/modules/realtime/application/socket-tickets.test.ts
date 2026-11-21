import { describe, expect, it } from 'vitest';
import type { AuthPrincipal } from '../../../shared/auth/auth.guard.js';
import {
  SOCKET_TICKET_TTL_SECONDS,
  type SocketTicketStore,
  SocketTickets,
} from './socket-tickets.js';

function memoryStore(): SocketTicketStore & { ttl: number } {
  const m = new Map<string, AuthPrincipal>();
  return {
    ttl: 0,
    put(t, p, ttl) {
      m.set(t, p);
      this.ttl = ttl;
      return Promise.resolve();
    },
    take(t) {
      const p = m.get(t) ?? null;
      m.delete(t);
      return Promise.resolve(p);
    },
  };
}

const ME: AuthPrincipal = { userId: 'u1', roles: ['vendor_owner'] };
const HEX = 'a'.repeat(64);

describe('SocketTickets', () => {
  it('issues a 60 s ticket that redeems to the principal exactly once', async () => {
    // Arrange
    const store = memoryStore();
    const tickets = new SocketTickets(store, () => HEX);
    // Act
    const issued = await tickets.issue(ME);
    const first = await tickets.redeem(issued.ticket);
    const replay = await tickets.redeem(issued.ticket);
    // Assert
    expect(issued.expiresInSeconds).toBe(SOCKET_TICKET_TTL_SECONDS);
    expect(store.ttl).toBe(60);
    expect(first).toEqual(ME);
    expect(replay).toBeNull();
  });

  it('rejects malformed tickets', async () => {
    const tickets = new SocketTickets(memoryStore(), () => HEX);
    expect(await tickets.redeem('not-a-ticket')).toBeNull();
  });
});
