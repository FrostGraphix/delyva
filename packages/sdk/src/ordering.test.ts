import { describe, expect, it } from 'vitest';
import { DelyvaClient } from './client.js';
import { orderingKeys } from './ordering.js';

const id = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';
const page = { items: [], nextCursor: null };

function client(body: unknown, seen: { url: string; init?: RequestInit }[]) {
  return new DelyvaClient({
    baseUrl: 'https://api.test',
    accessToken: () => 'tok',
    idempotencyKey: () => 'idem-key-1',
    fetch: (input, init) => {
      seen.push({ url: input as string, init });
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    },
  });
}

describe('OrderingClient', () => {
  it('builds paths, query strings and idempotency headers', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const c = client(page, seen).ordering;
    await c.listMyOrders({ limit: 5, cursor: 'abc' });
    await c.listVendorOrders(id, { status: 'PLACED' });
    await c.listAdminOrders({ customerId: id });
    expect(seen.map((s) => s.url)).toEqual([
      'https://api.test/v1/orders?limit=5&cursor=abc',
      `https://api.test/v1/vendors/${id}/orders?status=PLACED`,
      `https://api.test/v1/admin/orders?customerId=${id}`,
    ]);
    const headers = seen[0]?.init?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });

  it('sends Idempotency-Key on writes', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    await client({}, seen)
      .ordering.deleteCart(id)
      .catch(() => undefined);
    const headers = seen[0]?.init?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('idem-key-1');
    expect(seen[0]?.init?.method).toBe('DELETE');
    expect(orderingKeys.order('x')).toEqual(['ordering', 'order', 'x']);
  });
});
