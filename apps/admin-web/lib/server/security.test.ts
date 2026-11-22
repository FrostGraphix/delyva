// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { accessMaxAge, cookieAttributes } from './cookies';
import { csrfAllowed, newCsrfToken } from './csrf';
import { decodeClaims } from './jwt';
import { sessionInfo } from './session-info';

const base = {
  origin: 'http://localhost:3332',
  host: 'localhost:3332',
  cookieToken: 'abc',
  headerToken: 'abc',
};

function jwt(payload: object): string {
  return `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
}

describe('csrfAllowed', () => {
  it('lets safe methods through without a token', () => {
    expect(csrfAllowed({ ...base, method: 'GET', cookieToken: undefined, headerToken: null })).toBe(
      true,
    );
  });

  it('accepts a same-origin mutation echoing the cookie token', () => {
    expect(csrfAllowed({ ...base, method: 'POST' })).toBe(true);
  });

  it('rejects a cross-origin mutation even with matching tokens', () => {
    expect(csrfAllowed({ ...base, method: 'POST', origin: 'https://evil.example' })).toBe(false);
  });

  it('rejects a missing Origin, a missing header and a mismatched token', () => {
    expect(csrfAllowed({ ...base, method: 'PATCH', origin: null })).toBe(false);
    expect(csrfAllowed({ ...base, method: 'PUT', headerToken: null })).toBe(false);
    expect(csrfAllowed({ ...base, method: 'DELETE', headerToken: 'abd' })).toBe(false);
    expect(csrfAllowed({ ...base, method: 'POST', origin: 'not a url' })).toBe(false);
  });

  it('generates distinct url-safe tokens', () => {
    const a = newCsrfToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(newCsrfToken()).not.toBe(a);
  });
});

describe('cookies', () => {
  it('are always httpOnly, Secure and SameSite=Strict', () => {
    expect(cookieAttributes(60)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 60,
    });
  });

  it('expire the access cookie 30 s early but never below 1 s', () => {
    expect(accessMaxAge(900)).toBe(870);
    expect(accessMaxAge(10)).toBe(1);
  });
});

describe('decodeClaims / sessionInfo', () => {
  it('decodes roles without trusting malformed tokens', () => {
    expect(decodeClaims(jwt({ sub: 'u', roles: ['ops'], exp: 1 }))?.roles).toEqual(['ops']);
    expect(decodeClaims('garbage')).toBeNull();
    expect(decodeClaims(jwt({ sub: 'u' }))).toBeNull();
    expect(decodeClaims('a.!!!.c')).toBeNull();
  });

  it('marks only console roles as signed in', () => {
    const ops = sessionInfo(jwt({ sub: 'u', roles: ['ops'], exp: 1 }), true, 'c');
    expect(ops).toEqual({ signedIn: true, roles: ['ops'], twoFactor: true, csrf: 'c' });
    const customer = sessionInfo(jwt({ sub: 'u', roles: ['customer'], exp: 1 }), true, 'c');
    expect(customer).toEqual({ signedIn: false, roles: [], twoFactor: false, csrf: 'c' });
    expect(sessionInfo(undefined, false, 'c').signedIn).toBe(false);
  });
});
