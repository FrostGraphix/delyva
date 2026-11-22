import { NextResponse, type NextRequest } from 'next/server';
import { applyTokens, readSession, refreshTokens } from '@/lib/server/bff';
import { COOKIE, cookieAttributes } from '@/lib/server/cookies';
import { newCsrfToken } from '@/lib/server/csrf';
import { sessionInfo } from '@/lib/server/session-info';

const CSRF_MAX_AGE_S = 7 * 24 * 3600;

/**
 * GET /bff/auth/session — the page's view of the session plus the CSRF token. Issues the CSRF
 * cookie for anonymous visitors (the login form needs it) and refreshes an expired access token.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = readSession(req);
  const csrf = req.cookies.get(COOKIE.csrf)?.value ?? newCsrfToken();
  let access = session.accessToken;
  let refreshed = null;
  if (!access && session.refreshToken && session.deviceId) {
    refreshed = await refreshTokens(session.refreshToken, session.deviceId).catch(() => null);
    access = refreshed?.accessToken;
  }
  const res = NextResponse.json(sessionInfo(access, session.twoFactor !== undefined, csrf), {
    headers: { 'cache-control': 'no-store' },
  });
  res.cookies.set(COOKIE.csrf, csrf, cookieAttributes(CSRF_MAX_AGE_S));
  if (refreshed) applyTokens(res, refreshed);
  return res;
}
