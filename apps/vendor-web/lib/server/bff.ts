import { randomUUID } from 'node:crypto';
import type { TokenPair } from '@delyva/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { serverConfig } from './config';
import { clearSession, COOKIE, writeSession } from './cookies';
import { CSRF_HEADER, csrfViolation } from './csrf';
import { refreshOnce } from './refresh';

/** API path prefixes the browser may reach through the BFF (no auth or admin routes). */
export const PROXY_ALLOWLIST: readonly RegExp[] = [
  /^\/v1\/me\/vendors$/,
  /^\/v1\/vendors\/[0-9a-f-]{36}(\/.*)?$/,
  /^\/v1\/vendor-orders\/[0-9a-f-]{36}\/(accept|reject|preparing|ready)$/,
  /^\/v1\/orders\/[0-9a-f-]{36}$/,
  /^\/v1\/vendor-applications\/(me(\/[a-z-]+)?|menu-template)$/,
  /^\/v1\/realtime\/tickets$/,
];

const FORWARDED_HEADERS = ['content-type', 'idempotency-key', 'accept'] as const;

/** RFC 9457 problem response. */
export function problem(status: number, code: string, title: string): NextResponse {
  return NextResponse.json(
    { type: 'about:blank', title, status, code },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}

/**
 * The origin the browser used to reach us. `nextUrl.origin` can differ (dev binds to localhost
 * while the browser uses 127.0.0.1), so derive it from the Host header and forwarded protocol.
 */
export function selfOrigin(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host;
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '');
  return `${proto}://${host}`;
}

/** Rejects cross-site or token-less mutations. `requireToken=false` only for login. */
export function csrfGuard(req: NextRequest, requireToken: boolean): NextResponse | null {
  const { allowedOrigins } = serverConfig();
  const reason = csrfViolation({
    method: req.method,
    origin: req.headers.get('origin'),
    fetchSite: req.headers.get('sec-fetch-site'),
    selfOrigin: selfOrigin(req),
    allowedOrigins,
    cookieToken: req.cookies.get(COOKIE.csrf)?.value,
    headerToken: req.headers.get(CSRF_HEADER),
    requireToken,
  });
  return reason ? problem(403, 'forbidden', `CSRF check failed (${reason}).`) : null;
}

interface Session {
  access: string | undefined;
  refresh: string | undefined;
  device: string | undefined;
  rotated: TokenPair | null;
}

async function rotate(s: Session, apiUrl: string): Promise<boolean> {
  if (!s.refresh || !s.device) return false;
  const pair = await refreshOnce(apiUrl, s.refresh, s.device);
  if (!pair) return false;
  s.rotated = pair;
  s.access = pair.accessToken;
  s.refresh = pair.refreshToken;
  return true;
}

function callApi(
  apiUrl: string,
  path: string,
  req: NextRequest,
  body: ArrayBuffer | undefined,
  access: string | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  for (const h of FORWARDED_HEADERS) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  if (access) headers.authorization = `Bearer ${access}`;
  return fetch(`${apiUrl}${path}${req.nextUrl.search}`, {
    method: req.method,
    headers,
    ...(body && body.byteLength > 0 ? { body } : {}),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
}

/**
 * Forwards an allowlisted request to the API with the access token from the httpOnly cookie,
 * refreshing server-side (before expiry, or once on 401) and re-issuing cookies on rotation.
 */
export async function forward(req: NextRequest, path: string): Promise<NextResponse> {
  if (!PROXY_ALLOWLIST.some((r) => r.test(path))) return problem(404, 'not_found', 'Not found');
  const blocked = csrfGuard(req, true);
  if (blocked) return blocked;
  const { apiUrl } = serverConfig();
  const s: Session = {
    access: req.cookies.get(COOKIE.access)?.value,
    refresh: req.cookies.get(COOKIE.refresh)?.value,
    device: req.cookies.get(COOKIE.device)?.value,
    rotated: null,
  };
  if (!s.access && !(await rotate(s, apiUrl))) return expired();
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.arrayBuffer();
  let res = await callApi(apiUrl, path, req, body, s.access);
  if (res.status === 401) {
    if (!(await rotate(s, apiUrl))) return expired();
    res = await callApi(apiUrl, path, req, body, s.access);
  }
  const out = new NextResponse(res.status === 204 ? null : await res.arrayBuffer(), {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
  if (s.rotated && s.device) {
    writeSession(
      out.cookies,
      s.rotated,
      s.device,
      req.cookies.get(COOKIE.csrf)?.value ?? randomUUID(),
    );
  }
  return out;
}

function expired(): NextResponse {
  const res = problem(401, 'unauthorized', 'Your session has ended. Please sign in again.');
  clearSession(res.cookies);
  return res;
}
