import { describe, expect, it } from 'vitest';
import { DelyvaClient } from './client.js';
import { createRealtimeTicket, listMyVendors } from './vendor-portal.js';

const V = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';

function client(body: unknown, seen: { url: string; init?: RequestInit }[]): DelyvaClient {
  return new DelyvaClient({
    baseUrl: 'https://api.test',
    accessToken: () => 'tok',
    fetch: (input, init) => {
      seen.push({ url: input as string, init });
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    },
  });
}

describe('vendor portal SDK', () => {
  it('lists my vendors with the bearer token', async () => {
    // Arrange
    const seen: { url: string; init?: RequestInit }[] = [];
    const body = { items: [{ id: V, name: 'A', status: 'live', role: 'owner', branchIds: [V] }] };
    // Act
    const res = await listMyVendors(client(body, seen));
    // Assert
    expect(seen[0]?.url).toBe('https://api.test/v1/me/vendors');
    expect((seen[0]?.init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(res.items[0]?.role).toBe('owner');
  });

  it('mints a realtime ticket with POST', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const res = await createRealtimeTicket(
      client({ ticket: 'a'.repeat(64), expiresInSeconds: 60 }, seen),
    );
    expect(seen[0]?.init?.method).toBe('POST');
    expect(seen[0]?.url).toBe('https://api.test/v1/realtime/tickets');
    expect(res.expiresInSeconds).toBe(60);
  });
});
