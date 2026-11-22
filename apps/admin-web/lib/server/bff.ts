import { createHash } from 'node:crypto';
import {
  ADMIN_2FA_HEADER,
  type ErrorCode,
  TokenPairSchema,
  type TokenPair,
} from '@delyva/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, REFRESH_COOKIE_MAX_AGE_S, accessMaxAge, cookieAttributes } from './cookies';
import { CSRF_HEADER, csrfAllowed } from './csrf';
import { adminEnv } from './env';

/** Session material read from the request cookies. */
export interface BffSession {
  readonly accessToken: string | undefined;
  readonly refreshToken: string | undefined;
  readonly deviceId: string | undefined;
  readonly twoFactor: string | undefined;
}

/** Reads the session cookies. */
export function readSession(req: NextRequest): BffSession {
  return {
    accessToken: req.cookies.get(COOKIE.access)?.value,
    refreshToken: req.cookies.get(COOKIE.refresh)?.value,
    deviceId: req.cookies.get(COOKIE.device)?.value,
    twoFactor: req.cookies.get(COOKIE.twoFactor)?.value,
  };
}

/** RFC 9457 problem response produced by the BFF itself. */
export function problem(status: number, code: ErrorCode, title: string): NextResponse {
  return NextResponse.json(
    { type: `https://errors.delyva.ng/${code}`, title, status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

/** Rejects cross-site or token-less mutations. */
export function csrfRejection(req: NextRequest): NextResponse | null {
  const ok = csrfAllowed({
    method: req.method,
    origin: req.headers.get('origin'),
    host: req.headers.get('host'),
    cookieToken: req.cookies.get(COOKIE.csrf)?.value,
    headerToken: req.headers.get(CSRF_HEADER),
  });
  return ok ? null : problem(403, 'forbidden', 'CSRF check failed.');
}

/** One upstream call to the API (server-to-server, with timeout). */
export function callApi(
  path: string,
  init: { method: string; body?: string; headers?: Record<string, string> },
): Promise<Response> {
  const env = adminEnv();
  return fetch(`${env.ADMIN_API_BASE_URL}${path}`, {
    method: init.method,
    headers: { accept: 'application/json, application/problem+json', ...init.headers },
    ...(init.body === undefined ? {} : { body: init.body }),
    signal: AbortSignal.timeout(env.ADMIN_API_TIMEOUT_MS),
    cache: 'no-store',
  });
}

const inflight = new Map<string, { at: number; promise: Promise<TokenPair | null> }>();
const DEDUPE_MS = 15_000;

async function doRefresh(refreshToken: string, deviceId: string): Promise<TokenPair | null> {
  const res = await callApi('/v1/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken, deviceId }),
  });
  if (!res.ok) return null;
  const parsed = TokenPairSchema.safeParse(await res.json());
  return parsed.success ? parsed.data : null;
}

/**
 * Rotates the refresh token. Concurrent requests holding the same refresh token share one
 * rotation (a second use would look like replay and revoke the whole family).
 * DEBT(admin-web): in-process dedupe only — several BFF instances need a Redis lock — add with
 * horizontal scaling of admin-web.
 */
export function refreshTokens(refreshToken: string, deviceId: string): Promise<TokenPair | null> {
  const key = createHash('sha256').update(refreshToken).digest('hex');
  const now = Date.now();
  const hit = inflight.get(key);
  if (hit && now - hit.at < DEDUPE_MS) return hit.promise;
  const promise = doRefresh(refreshToken, deviceId).catch(() => null);
  inflight.set(key, { at: now, promise });
  for (const [k, v] of inflight) if (now - v.at >= DEDUPE_MS) inflight.delete(k);
  return promise;
}

/** Writes a fresh token pair to the response cookies. */
export function applyTokens(res: NextResponse, pair: TokenPair): void {
  res.cookies.set(
    COOKIE.access,
    pair.accessToken,
    cookieAttributes(accessMaxAge(pair.accessTokenExpiresIn)),
  );
  res.cookies.set(COOKIE.refresh, pair.refreshToken, cookieAttributes(REFRESH_COOKIE_MAX_AGE_S));
}

/** Deletes every session cookie (keeps the device id and CSRF token). */
export function clearSession(res: NextResponse): void {
  for (const name of [COOKIE.access, COOKIE.refresh, COOKIE.twoFactor]) {
    res.cookies.set(name, '', cookieAttributes(0));
  }
}

/** Result of an authenticated upstream call. */
export interface AuthedResult {
  readonly upstream: Response | null;
  readonly refreshed: TokenPair | null;
}

function authHeaders(session: BffSession, access: string): Record<string, string> {
  return {
    authorization: `Bearer ${access}`,
    ...(session.twoFactor ? { [ADMIN_2FA_HEADER]: session.twoFactor } : {}),
  };
}

/**
 * Calls the API as the signed-in admin: refreshes first when the access cookie has expired,
 * and once more on a 401. `upstream` is null when no valid session exists.
 */
export async function callAsAdmin(
  session: BffSession,
  path: string,
  init: { method: string; body?: string; headers?: Record<string, string> },
): Promise<AuthedResult> {
  let refreshed: TokenPair | null = null;
  const canRefresh = session.refreshToken !== undefined && session.deviceId !== undefined;
  let access = session.accessToken;
  if (!access && canRefresh) {
    refreshed = await refreshTokens(session.refreshToken, session.deviceId);
    access = refreshed?.accessToken;
  }
  if (!access) return { upstream: null, refreshed: null };
  const send = (token: string): Promise<Response> =>
    callApi(path, { ...init, headers: { ...init.headers, ...authHeaders(session, token) } });
  let upstream = await send(access);
  if (upstream.status === 401 && refreshed === null && canRefresh) {
    refreshed = await refreshTokens(session.refreshToken, session.deviceId);
    if (refreshed) upstream = await send(refreshed.accessToken);
  }
  return { upstream, refreshed };
}

/** Copies an upstream response (status, JSON/problem body) into a NextResponse. */
export async function relay(result: AuthedResult): Promise<NextResponse> {
  if (!result.upstream) {
    const res = problem(401, 'unauthorized', 'Sign in again.');
    clearSession(res);
    return res;
  }
  const body = result.upstream.status === 204 ? null : await result.upstream.text();
  const res = new NextResponse(body, {
    status: result.upstream.status,
    headers: {
      'content-type': result.upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
  if (result.refreshed) applyTokens(res, result.refreshed);
  if (result.upstream.status === 401) clearSession(res);
  return res;
}
