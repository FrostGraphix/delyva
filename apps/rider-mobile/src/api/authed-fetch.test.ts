import { createAuthedFetch } from './authed-fetch';

const res = (status: number): Response => new Response(null, { status });

describe('createAuthedFetch', () => {
  it('refreshes once on 401 and retries with the new bearer token', async () => {
    // Arrange
    const seen: (string | null)[] = [];
    const base = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('authorization');
      seen.push(auth);
      return Promise.resolve(res(auth === 'Bearer new' ? 200 : 401));
    });
    const refresh = jest.fn(() => Promise.resolve('new'));
    const f = createAuthedFetch({ fetch: base as typeof fetch, accessToken: () => 'old', refresh });

    // Act
    const [a, b] = await Promise.all([
      f('https://api.test/v1/riders/me', { headers: { authorization: 'Bearer old' } }),
      f('https://api.test/v1/riders/me', { headers: { authorization: 'Bearer old' } }),
    ]);

    // Assert
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seen.filter((s) => s === 'Bearer new')).toHaveLength(2);
  });

  it('never refreshes for auth endpoints', async () => {
    const refresh = jest.fn(() => Promise.resolve('new'));
    const f = createAuthedFetch({
      fetch: () => Promise.resolve(res(401)),
      accessToken: () => 'old',
      refresh,
    });
    expect((await f('https://api.test/v1/auth/otp/verify')).status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns the 401 when the session cannot be refreshed', async () => {
    const f = createAuthedFetch({
      fetch: () => Promise.resolve(res(401)),
      accessToken: () => 'old',
      refresh: () => Promise.resolve(null),
    });
    expect((await f('https://api.test/v1/riders/me')).status).toBe(401);
  });

  it('passes through 401s when signed out', async () => {
    const refresh = jest.fn(() => Promise.resolve('new'));
    const f = createAuthedFetch({
      fetch: () => Promise.resolve(res(401)),
      accessToken: () => null,
      refresh,
    });
    expect((await f('https://api.test/v1/riders/me')).status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });
});
