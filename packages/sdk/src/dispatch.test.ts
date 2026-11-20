import { describe, expect, it } from 'vitest';
import { ApiError, DelyvaClient } from './client.js';
import { dispatchKeys } from './dispatch-hooks.js';

const trip = {
  id: '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11',
  orderId: '1b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11',
  riderId: '2b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11',
  status: 'picked_up',
  pickup: { lat: 6.4, lng: 3.4 },
  dropoff: { lat: 6.5, lng: 3.5 },
  assignment: 'offer',
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
};

function client(status: number, body: unknown, seen: { url: string; init?: RequestInit }[]) {
  return new DelyvaClient({
    baseUrl: 'https://api.test',
    accessToken: () => 'tok',
    idempotencyKey: () => 'idem-key-1',
    fetch: (input, init) => {
      seen.push({ url: input as string, init });
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    },
  });
}

describe('DelyvaClient dispatch', () => {
  it('posts trip actions with a caller-supplied idempotency key (offline replay)', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const out = await client(200, trip, seen).tripAction(
      trip.id,
      'picked-up',
      {},
      'queued-key-0001',
    );
    expect(out.status).toBe('picked_up');
    expect(seen[0]?.url).toBe(`https://api.test/v1/trips/${trip.id}/picked-up`);
    expect((seen[0]?.init?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'queued-key-0001',
    );
  });

  it('builds offer and manual-assign paths and surfaces problems', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    await client(200, trip, seen).acceptDispatchOffer('abc');
    await client(200, trip, seen).manuallyAssignOrder('ord-1', {
      riderId: trip.riderId,
      reason: 'ops override',
    });
    expect(seen.map((s) => s.url)).toEqual([
      'https://api.test/v1/dispatch-offers/abc/accept',
      'https://api.test/v1/admin/dispatch/orders/ord-1/assign',
    ]);
    const problem = { type: 'about:blank', title: 'Error', status: 422, code: 'rider_too_far' };
    await expect(
      client(422, problem, []).tripAction(trip.id, 'delivered', { deliveryOtp: '1234' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(dispatchKeys.currentTrip()).toEqual(['dispatch', 'me', 'current-trip']);
  });
});
