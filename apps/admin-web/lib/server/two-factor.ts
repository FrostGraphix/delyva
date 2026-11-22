import { AdminTwoFactorSessionSchema, TotpCodeSchema } from '@delyva/contracts';
import { NextResponse, type NextRequest } from 'next/server';
import { applyTokens, callAsAdmin, csrfRejection, problem, readSession, relay } from './bff';
import { COOKIE, cookieAttributes } from './cookies';

/**
 * Shared handler for `/bff/auth/2fa/confirm` and `/bff/auth/2fa/verify`: sends the TOTP code
 * and stores the returned 2FA session token in an httpOnly cookie (never returned to the page).
 */
export async function exchangeTotp(
  req: NextRequest,
  apiPath: '/v1/admin/2fa/enrolment/confirm' | '/v1/admin/2fa/verify',
): Promise<NextResponse> {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const parsed = TotpCodeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, 'validation_failed', 'Enter the 6-digit code.');
  try {
    const result = await callAsAdmin(readSession(req), apiPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    if (!result.upstream?.ok) return await relay(result);
    const session = AdminTwoFactorSessionSchema.parse(await result.upstream.json());
    const res = NextResponse.json(
      { expiresInSeconds: session.expiresInSeconds },
      { headers: { 'cache-control': 'no-store' } },
    );
    res.cookies.set(COOKIE.twoFactor, session.token, cookieAttributes(session.expiresInSeconds));
    if (result.refreshed) applyTokens(res, result.refreshed);
    return res;
  } catch {
    return problem(502, 'internal_error', 'The Delyva API is unreachable. Try again.');
  }
}
