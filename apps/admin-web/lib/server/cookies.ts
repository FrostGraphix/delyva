/**
 * Cookie names and attributes of the admin BFF (ADR 0830). Every cookie is httpOnly, Secure and
 * SameSite=Strict: the browser never sees access, refresh or 2FA tokens, nor the CSRF secret
 * (the CSRF value reaches the page only through the same-origin `GET /bff/auth/session`).
 */
export const COOKIE = {
  access: 'dl_admin_at',
  refresh: 'dl_admin_rt',
  device: 'dl_admin_did',
  twoFactor: 'dl_admin_2fa',
  csrf: 'dl_admin_csrf',
} as const;

/** Refresh-token lifetime used for the cookie (the API revokes on its own schedule). */
export const REFRESH_COOKIE_MAX_AGE_S = 30 * 24 * 3600;

/** Attributes of one cookie. */
export interface CookieAttributes {
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'strict';
  readonly path: '/';
  readonly maxAge: number;
}

/** Standard attributes; `maxAge` in seconds (0 deletes). */
export function cookieAttributes(maxAge: number): CookieAttributes {
  return { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge };
}

/** Access-cookie lifetime: expire 30 s before the JWT so the BFF refreshes early. */
export function accessMaxAge(expiresInSeconds: number): number {
  return Math.max(1, expiresInSeconds - 30);
}
