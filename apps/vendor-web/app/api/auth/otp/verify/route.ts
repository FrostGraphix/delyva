import { randomUUID } from 'node:crypto';
import { NigeriaPhoneSchema, OtpCodeSchema, TokenPairSchema } from '@delyva/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { csrfGuard, problem } from '../../../../../lib/server/bff';
import { serverConfig } from '../../../../../lib/server/config';
import { COOKIE, writeSession } from '../../../../../lib/server/cookies';

const BodySchema = z.strictObject({ phone: NigeriaPhoneSchema, code: OtpCodeSchema });

/**
 * POST /api/auth/otp/verify — exchanges the OTP for a token pair and stores it only in httpOnly
 * cookies. The browser receives `{ ok: true }`, never a token.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = csrfGuard(req, false);
  if (blocked) return blocked;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, 'validation_failed', 'Enter the 6-digit code.');
  const deviceId = req.cookies.get(COOKIE.device)?.value ?? `web-${randomUUID()}`;
  const res = await fetch(`${serverConfig().apiUrl}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...parsed.data, deviceId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return new NextResponse(await res.arrayBuffer(), {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/problem+json' },
    });
  }
  const pair = TokenPairSchema.parse(await res.json());
  const out = NextResponse.json({ ok: true });
  writeSession(out.cookies, pair, deviceId, randomUUID());
  return out;
}
