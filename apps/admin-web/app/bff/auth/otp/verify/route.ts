import { NigeriaPhoneSchema, OtpCodeSchema, TokenPairSchema } from '@delyva/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { applyTokens, callApi, csrfRejection, problem, relay } from '@/lib/server/bff';
import { COOKIE, REFRESH_COOKIE_MAX_AGE_S, cookieAttributes } from '@/lib/server/cookies';
import { decodeClaims } from '@/lib/server/jwt';
import { hasConsoleRole } from '@/lib/roles';

const BodySchema = z.strictObject({ phone: NigeriaPhoneSchema, code: OtpCodeSchema });

async function revoke(refreshToken: string): Promise<void> {
  await callApi('/v1/auth/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  }).catch(() => undefined);
}

/**
 * POST /bff/auth/otp/verify — exchanges the OTP for tokens, refuses non-console roles (and
 * revokes their fresh session), then stores the tokens in httpOnly cookies only.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, 'validation_failed', 'Enter the 6-digit code.');
  const deviceId = req.cookies.get(COOKIE.device)?.value ?? `admin-web-${crypto.randomUUID()}`;
  try {
    const upstream = await callApi('/v1/auth/otp/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...parsed.data, deviceId }),
    });
    if (!upstream.ok) return await relay({ upstream, refreshed: null });
    const pair = TokenPairSchema.parse(await upstream.json());
    const roles = decodeClaims(pair.accessToken)?.roles ?? [];
    if (!hasConsoleRole(roles)) {
      await revoke(pair.refreshToken);
      return problem(403, 'forbidden', 'This account does not have console access.');
    }
    const res = NextResponse.json({ roles }, { headers: { 'cache-control': 'no-store' } });
    applyTokens(res, pair);
    res.cookies.set(COOKIE.device, deviceId, cookieAttributes(REFRESH_COOKIE_MAX_AGE_S));
    res.cookies.set(COOKIE.twoFactor, '', cookieAttributes(0));
    return res;
  } catch {
    return problem(502, 'internal_error', 'The Delyva API is unreachable. Try again.');
  }
}
