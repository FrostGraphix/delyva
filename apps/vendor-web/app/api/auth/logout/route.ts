import { type NextRequest, NextResponse } from 'next/server';
import { csrfGuard } from '../../../../lib/server/bff';
import { serverConfig } from '../../../../lib/server/config';
import { clearSession, COOKIE } from '../../../../lib/server/cookies';

/** POST /api/auth/logout — revokes the refresh-token family at the API and clears cookies. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = csrfGuard(req, true);
  if (blocked) return blocked;
  const refreshToken = req.cookies.get(COOKIE.refresh)?.value;
  const access = req.cookies.get(COOKIE.access)?.value;
  if (refreshToken) {
    await fetch(`${serverConfig().apiUrl}/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(access ? { authorization: `Bearer ${access}` } : {}),
      },
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined);
  }
  const out = NextResponse.json({ ok: true });
  clearSession(out.cookies);
  return out;
}
