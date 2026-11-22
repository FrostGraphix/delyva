import { NextResponse, type NextRequest } from 'next/server';
import { callApi, clearSession, csrfRejection, readSession } from '@/lib/server/bff';

/** POST /bff/auth/logout — revokes the refresh token at the API and clears every cookie. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const { refreshToken } = readSession(req);
  if (refreshToken) {
    await callApi('/v1/auth/logout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
  }
  const res = new NextResponse(null, { status: 204 });
  clearSession(res);
  return res;
}
