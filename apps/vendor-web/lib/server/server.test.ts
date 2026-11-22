import { describe, expect, it, vi } from 'vitest';
import { csrfViolation, type CsrfInput } from './csrf';
import { refreshOnce } from './refresh';

const base: CsrfInput = {
  method: 'POST',
  origin: 'https://vendor.delyva.test',
  fetchSite: 'same-origin',
  selfOrigin: 'https://vendor.delyva.test',
  allowedOrigins: [],
  cookieToken: 'tok-123',
  headerToken: 'tok-123',
  requireToken: true,
};

describe('csrfViolation', () => {
  it('allows same-origin mutations with a matching double-submit token', () => {
    expect(csrfViolation(base)).toBeNull();
  });

  it('never blocks safe methods', () => {
    expect(csrfViolation({ ...base, method: 'GET', origin: null, headerToken: null })).toBeNull();
  });

  it('rejects cross-site, foreign-origin and origin-less mutations', () => {
    expect(csrfViolation({ ...base, fetchSite: 'cross-site' })).toBe('cross_site_request');
    expect(csrfViolation({ ...base, origin: 'https://evil.test' })).toBe('bad_origin');
    expect(csrfViolation({ ...base, origin: null })).toBe('missing_origin');
  });

  it('accepts allowlisted origins', () => {
    expect(
      csrfViolation({
        ...base,
        origin: 'https://kds.delyva.test',
        allowedOrigins: ['https://kds.delyva.test'],
      }),
    ).toBeNull();
  });

  it('rejects missing or mismatched tokens once a session exists', () => {
    expect(csrfViolation({ ...base, headerToken: null })).toBe('missing_token');
    expect(csrfViolation({ ...base, headerToken: 'tok-999' })).toBe('token_mismatch');
    expect(csrfViolation({ ...base, headerToken: 'x' })).toBe('token_mismatch');
  });

  it('skips the token for login but still checks the origin', () => {
    expect(
      csrfViolation({ ...base, cookieToken: undefined, headerToken: null, requireToken: false }),
    ).toBeNull();
  });
});

describe('refreshOnce', () => {
  const pair = {
    accessToken: 'a',
    accessTokenExpiresIn: 900,
    refreshToken: 'r2',
    tokenType: 'Bearer',
    userId: '30000000-0000-4000-8000-000000000001',
  };

  it('shares one rotation between concurrent callers (reuse would revoke the family)', async () => {
    // Arrange
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify(pair), { status: 200 })));
    // Act
    const [a, b] = await Promise.all([
      refreshOnce('http://api', 'r1-shared-token', 'dev-1', f),
      refreshOnce('http://api', 'r1-shared-token', 'dev-1', f),
    ]);
    // Assert
    expect(f).toHaveBeenCalledTimes(1);
    expect(a?.refreshToken).toBe('r2');
    expect(b).toEqual(a);
  });

  it('returns null when the API refuses the refresh token', async () => {
    const f = vi.fn(() => Promise.resolve(new Response('{}', { status: 401 })));
    expect(await refreshOnce('http://api', 'r1-rejected-token', 'dev-1', f)).toBeNull();
  });
});
