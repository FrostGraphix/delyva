import type { TokenPair } from '@delyva/contracts';

/** Cookie names (ADR 0820). Tokens live only in httpOnly cookies; JS can read only the CSRF one. */
export const COOKIE = {
  access: 'dv_at',
  refresh: 'dv_rt',
  device: 'dv_did',
  csrf: 'dv_csrf',
} as const;

/** Refresh token lifetime mirrored from the API (30 days). */
export const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
/** Refresh the access token this many seconds before it expires. */
export const ACCESS_EARLY_REFRESH_SECONDS = 30;

/** Minimal cookie writer shared by `NextResponse.cookies` and `cookies()` from next/headers. */
export interface CookieWriter {
  set(
    name: string,
    value: string,
    options: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'lax' | 'strict';
      path: string;
      maxAge: number;
    },
  ): unknown;
}

/** Minimal cookie reader. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

const base = { secure: true, sameSite: 'lax', path: '/' } as const;

/**
 * Writes the session cookies. `Secure` is always on (browsers treat localhost as a secure
 * context), access/refresh/device are httpOnly, and the CSRF token is readable by JS for the
 * double-submit header.
 */
export function writeSession(
  jar: CookieWriter,
  pair: TokenPair,
  deviceId: string,
  csrf: string,
): void {
  const accessAge = Math.max(pair.accessTokenExpiresIn - ACCESS_EARLY_REFRESH_SECONDS, 30);
  jar.set(COOKIE.access, pair.accessToken, { ...base, httpOnly: true, maxAge: accessAge });
  jar.set(COOKIE.refresh, pair.refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: REFRESH_MAX_AGE_SECONDS,
  });
  jar.set(COOKIE.device, deviceId, { ...base, httpOnly: true, maxAge: REFRESH_MAX_AGE_SECONDS });
  jar.set(COOKIE.csrf, csrf, { ...base, httpOnly: false, maxAge: REFRESH_MAX_AGE_SECONDS });
}

/** Expires every session cookie. */
export function clearSession(jar: CookieWriter): void {
  for (const name of Object.values(COOKIE)) {
    jar.set(name, '', { ...base, httpOnly: name !== COOKIE.csrf, maxAge: 0 });
  }
}
