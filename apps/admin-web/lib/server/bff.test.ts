// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callAsAdmin, relay, type BffSession } from './bff';

const PAIR = {
  accessToken: 'new-access',
  accessTokenExpiresIn: 900,
  refreshToken: 'new-refresh-token-0123456789',
  tokenType: 'Bearer',
  userId: '00000000-0000-4000-8000-000000000001',
};

function session(over: Partial<BffSession> = {}): BffSession {
  return {
    accessToken: 'old-access',
    refreshToken: `rt-${crypto.randomUUID()}`,
    deviceId: 'device-12345',
    twoFactor: 'tf',
    ...over,
  };
}

const fetchMock = vi.fn<typeof fetch>();
const urlOf = (input: unknown): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : '';

beforeEach(() => {
  process.env.ADMIN_API_BASE_URL = 'http://api.test';
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('callAsAdmin', () => {
  it('sends bearer + x-admin-2fa server-side', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [] }));
    const r = await callAsAdmin(session(), '/v1/admin/feature-flags', { method: 'GET' });
    expect(r.upstream?.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://api.test/v1/admin/feature-flags');
    expect(init?.headers).toMatchObject({
      authorization: 'Bearer old-access',
      'x-admin-2fa': 'tf',
    });
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { code: 'unauthorized' }))
      .mockResolvedValueOnce(json(200, PAIR))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const r = await callAsAdmin(session(), '/v1/admin/promos', { method: 'GET' });
    expect(r.refreshed?.accessToken).toBe('new-access');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://api.test/v1/auth/refresh');
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer new-access',
    });
  });

  it('refreshes first when the access cookie has expired', async () => {
    fetchMock.mockResolvedValueOnce(json(200, PAIR)).mockResolvedValueOnce(json(200, {}));
    const r = await callAsAdmin(session({ accessToken: undefined }), '/v1/admin/x', {
      method: 'GET',
    });
    expect(r.refreshed).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one rotation between concurrent requests (no refresh-token replay)', async () => {
    fetchMock.mockImplementation((url) =>
      Promise.resolve(urlOf(url).endsWith('/v1/auth/refresh') ? json(200, PAIR) : json(200, {})),
    );
    const s = session({ accessToken: undefined });
    await Promise.all([
      callAsAdmin(s, '/v1/admin/a', { method: 'GET' }),
      callAsAdmin(s, '/v1/admin/b', { method: 'GET' }),
    ]);
    const refreshes = fetchMock.mock.calls.filter(([u]) => urlOf(u).endsWith('/v1/auth/refresh'));
    expect(refreshes).toHaveLength(1);
  });

  it('returns no upstream without any session', async () => {
    const r = await callAsAdmin(
      session({ accessToken: undefined, refreshToken: undefined }),
      '/v1/admin/x',
      { method: 'GET' },
    );
    expect(r.upstream).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('relay', () => {
  it('turns a missing session into 401 problem+json and clears cookies', async () => {
    const res = await relay({ upstream: null, refreshed: null });
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('problem+json');
    expect(res.cookies.get('dl_admin_rt')?.value).toBe('');
  });

  it('copies the upstream body and writes refreshed httpOnly cookies', async () => {
    const res = await relay({ upstream: json(201, { id: 1 }), refreshed: PAIR as never });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 1 });
    const at = res.cookies.get('dl_admin_at');
    expect(at?.value).toBe('new-access');
    expect(at?.httpOnly).toBe(true);
    expect(at?.sameSite).toBe('strict');
  });
});
