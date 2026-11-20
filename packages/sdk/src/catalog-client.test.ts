import { describe, expect, it } from 'vitest';
import { DelyvaClient, pathOf } from './client.js';

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

const V = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';
const price = { amountMinor: 350000, currency: 'NGN' };
const item = {
  id: V,
  categoryId: V,
  name: 'Party jollof',
  description: null,
  price,
  available: true,
  modifierGroups: [],
};
const option = { id: V, name: 'Beef', priceDelta: price, available: false };
const vendor = {
  id: V,
  name: 'Jollof Junction',
  category: 'restaurant',
  status: 'live',
  description: null,
  branches: [],
  menu: { categories: [] },
};
const address = {
  id: V,
  label: 'Home',
  line1: '12 Admiralty Way',
  landmark: null,
  lat: 6.44,
  lng: 3.47,
  createdAt: '2026-11-20T10:00:00.000Z',
};

function client(body: unknown, captured: Captured[], status = 200) {
  return new DelyvaClient({
    baseUrl: 'https://api.test',
    getAccessToken: () => 'token-abc',
    idempotencyKey: () => 'gen-key-1',
    fetch: (input, init) => {
      captured.push({ url: input as string, init });
      return Promise.resolve(
        new Response(body === undefined ? null : JSON.stringify(body), { status }),
      );
    },
  });
}

const headers = (c: Captured | undefined) => c?.init?.headers as Record<string, string>;

describe('DelyvaClient catalog + geo', () => {
  it('builds discovery query strings without auth', async () => {
    const captured: Captured[] = [];
    const c = client({ items: [] }, captured);
    await c.discoverVendors({ lat: 6.43, lng: 3.42, category: 'grocery' });
    await c.discoverVendors({ lat: 6.43, lng: 3.42 });
    expect(captured[0]?.url).toBe('https://api.test/v1/vendors?lat=6.43&lng=3.42&category=grocery');
    expect(captured[1]?.url).toBe('https://api.test/v1/vendors?lat=6.43&lng=3.42');
    expect(headers(captured[0]).authorization).toBeUndefined();
    expect(captured[0]?.init?.method).toBe('GET');
  });

  it('fetches a vendor and approves it', async () => {
    const captured: Captured[] = [];
    const c = client(vendor, captured);
    await expect(c.getVendor(V)).resolves.toEqual(vendor);
    await c.approveVendor(V, 'ops-key-1');
    expect(captured[1]?.url).toBe(`https://api.test/v1/vendors/${V}/go-live`);
    expect(headers(captured[1])['Idempotency-Key']).toBe('ops-key-1');
    expect(captured[1]?.init?.body).toBeUndefined();
  });

  it('sends bearer token, JSON body and idempotency key on vendor writes', async () => {
    const captured: Captured[] = [];
    const c = client(item, captured);
    await c.createMenuItem(V, {
      categoryId: V,
      name: 'Party jollof',
      price: { amountMinor: 1, currency: 'NGN' },
    });
    await c.updateMenuItem(V, V, { name: 'x' }, 'k-2');
    await c.setItemAvailability(V, V, { available: false });
    const h = headers(captured[0]);
    expect(h.authorization).toBe('Bearer token-abc');
    expect(h['Idempotency-Key']).toBe('gen-key-1');
    expect(h['content-type']).toBe('application/json');
    expect(captured[1]?.init?.method).toBe('PATCH');
    expect(headers(captured[1])['Idempotency-Key']).toBe('k-2');
    expect(captured[2]?.url).toBe(`https://api.test/v1/vendors/${V}/items/${V}/availability`);
  });

  it('covers modifier, hours and option endpoints', async () => {
    const captured: Captured[] = [];
    await client(option, captured).setModifierOptionAvailability(V, V, { available: false });
    await client(
      { id: V, name: 'Size', minSelect: 1, maxSelect: 1, options: [option] },
      captured,
    ).createModifierGroup(V, V, {
      name: 'Size',
      minSelect: 1,
      maxSelect: 1,
      options: [{ name: 'Large', priceDelta: { amountMinor: 0, currency: 'NGN' } }],
    });
    const hours = { hours: [{ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' }] };
    await expect(client(hours, captured).replaceOpeningHours(V, V, hours)).resolves.toEqual(hours);
    expect(captured.map((c) => c.init?.method)).toEqual(['PUT', 'POST', 'PUT']);
  });

  it('manages addresses', async () => {
    const captured: Captured[] = [];
    await expect(client({ items: [address] }, captured).listAddresses()).resolves.toEqual({
      items: [address],
    });
    await client(address, captured).createAddress({
      label: 'Home',
      line1: '12 Admiralty Way',
      lat: 6.44,
      lng: 3.47,
    });
    await client(address, captured).updateAddress(V, { label: 'Office' });
    await client(undefined, captured, 204).deleteAddress(V);
    expect(captured.map((c) => c.init?.method)).toEqual(['GET', 'POST', 'PATCH', 'DELETE']);
    expect(headers(captured[0]).authorization).toBe('Bearer token-abc');
  });

  it('omits authorization when no token is available and encodes path params', async () => {
    const captured: Captured[] = [];
    const c = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: (input, init) => {
        captured.push({ url: input as string, init });
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }));
      },
    });
    await c.listAddresses();
    expect(headers(captured[0]).authorization).toBeUndefined();
    expect(pathOf('/v1/vendors/{vendorId}', { vendorId: 'a/b' })).toBe('/v1/vendors/a%2Fb');
    expect(() => pathOf('/v1/vendors/{vendorId}', {})).toThrow('missing path param');
  });
});
