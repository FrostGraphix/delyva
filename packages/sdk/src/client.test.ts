import { describe, expect, it } from 'vitest';
import { ApiError, DelyvaClient } from './client.js';
import { authKeys } from './hooks.js';

interface Captured {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(status: number, body: unknown, captured: Captured[] = []): typeof fetch {
  return (input, init) => {
    captured.push({ url: input as string, init });
    const payload = body === undefined ? null : JSON.stringify(body);
    return Promise.resolve(new Response(payload, { status }));
  };
}

const tokens = {
  accessToken: 'a',
  accessTokenExpiresIn: 900,
  refreshToken: 'r'.repeat(43),
  tokenType: 'Bearer',
  userId: '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11',
};

describe('DelyvaClient', () => {
  it('sends an Idempotency-Key with OTP requests', async () => {
    const captured: Captured[] = [];
    const client = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: fakeFetch(202, { expiresInSeconds: 300, resendAfterSeconds: 60 }, captured),
    });
    const res = await client.requestOtp({ phone: '+2348031234567' }, 'key-12345678');
    expect(res.expiresInSeconds).toBe(300);
    expect(captured[0]?.url).toBe('https://api.test/v1/auth/otp/request');
    expect((captured[0]?.init?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'key-12345678',
    );
  });

  it('generates an idempotency key when none is given', async () => {
    const captured: Captured[] = [];
    const client = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: fakeFetch(202, { expiresInSeconds: 300, resendAfterSeconds: 60 }, captured),
      idempotencyKey: () => 'generated-key',
    });
    await client.requestOtp({ phone: '+2348031234567' });
    expect((captured[0]?.init?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'generated-key',
    );
  });

  it('parses token pairs from verify and refresh', async () => {
    const client = new DelyvaClient({ baseUrl: 'https://api.test', fetch: fakeFetch(200, tokens) });
    await expect(
      client.verifyOtp({ phone: '+2348031234567', code: '123456', deviceId: 'device-1234' }),
    ).resolves.toEqual(tokens);
    await expect(
      client.refresh({ refreshToken: tokens.refreshToken, deviceId: 'device-1234' }),
    ).resolves.toEqual(tokens);
  });

  it('resolves logout on 204', async () => {
    const client = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: fakeFetch(204, undefined),
    });
    await expect(client.logout({ refreshToken: tokens.refreshToken })).resolves.toBeUndefined();
  });

  it('throws ApiError with the problem details', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      code: 'refresh_token_reused',
      detail: 'Sign in again.',
    };
    const client = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: fakeFetch(401, problem),
    });
    const err: unknown = await client
      .refresh({ refreshToken: tokens.refreshToken, deviceId: 'device-1234' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).problem.code).toBe('refresh_token_reused');
  });

  it('falls back to a generic problem for non-problem bodies', async () => {
    const client = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: fakeFetch(502, undefined),
    });
    const err = (await client
      .verifyOtp({ phone: '+2348031234567', code: '123456', deviceId: 'device-1234' })
      .catch((e: unknown) => e)) as ApiError;
    expect(err.problem).toMatchObject({ status: 502, code: 'internal_error' });
    const bad = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: fakeFetch(400, { nope: true }),
    });
    const err2 = (await bad
      .logout({ refreshToken: tokens.refreshToken })
      .catch((e: unknown) => e)) as ApiError;
    expect(err2.problem.status).toBe(400);
  });

  it('sends Bearer tokens, GET without body, PATCH with id and idempotent admin creates', async () => {
    const captured: Captured[] = [];
    const promo = {
      id: '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11',
      code: 'WEEKEND',
      type: 'free_delivery',
      valueMinor: null,
      percentBps: null,
      maxDiscountMinor: null,
      minOrderMinor: 300000,
      audience: 'all',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2028-01-01T00:00:00.000Z',
      activeDaysOfWeek: [0, 6],
      perUserLimit: 8,
      globalLimit: null,
      budgetMinor: null,
      active: true,
      redemptionCount: 0,
      spentMinor: 0,
      updatedAt: '2026-11-19T00:00:00.000Z',
    };
    const client = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: fakeFetch(200, promo, captured),
      accessToken: () => 'tok',
      idempotencyKey: () => 'idem-key-1',
    });
    await client.updatePromo(promo.id, { active: false });
    expect(captured[0]?.url).toBe(`https://api.test/v1/admin/promos/${promo.id}`);
    expect(captured[0]?.init?.method).toBe('PATCH');
    const headers = captured[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok');
    await client.createPromo({ ...promo, code: 'WEEKEND', type: 'free_delivery' } as never);
    expect((captured[1]?.init?.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'idem-key-1',
    );
    const list = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: fakeFetch(200, { items: [promo] }, captured),
    });
    await expect(list.listPromos()).resolves.toEqual({ items: [promo] });
    expect(captured[2]?.init?.body).toBeUndefined();
    expect((captured[2]?.init?.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('calls quote and fee-rule endpoints on their registry paths', async () => {
    const captured: Captured[] = [];
    const reject = new DelyvaClient({
      baseUrl: 'https://api.test',
      fetch: fakeFetch(
        403,
        {
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          code: 'forbidden',
        },
        captured,
      ),
    });
    const calls = [
      reject.createQuote({
        zoneCode: 'lagos',
        pickup: { lat: 6.4, lng: 3.4 },
        dropoff: { lat: 6.5, lng: 3.5 },
        lines: [{ unitPriceMinor: 1, quantity: 1, modifierDeltasMinor: [] }],
      }),
      reject.listFeeRules(),
      reject.createFeeRule({} as never, 'k-12345678'),
      reject.updateFeeRule('abc', {}),
    ];
    for (const call of calls) await expect(call).rejects.toBeInstanceOf(ApiError);
    expect(captured.map((c) => `${String(c.init?.method)} ${c.url}`)).toEqual([
      'POST https://api.test/v1/quotes',
      'GET https://api.test/v1/admin/fee-rules',
      'POST https://api.test/v1/admin/fee-rules',
      'PATCH https://api.test/v1/admin/fee-rules/abc',
    ]);
  });

  it('exposes stable mutation keys', () => {
    expect(authKeys.verifyOtp()).toEqual(['auth', 'otp', 'verify']);
  });
});
