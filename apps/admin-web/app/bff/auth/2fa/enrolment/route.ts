import type { NextRequest, NextResponse } from 'next/server';
import { callAsAdmin, csrfRejection, problem, readSession, relay } from '@/lib/server/bff';

/**
 * POST /bff/auth/2fa/enrolment — starts TOTP enrolment. The secret and otpauth URI are returned
 * once so the admin can add them to an authenticator app; the BFF does not store them.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  try {
    const result = await callAsAdmin(readSession(req), '/v1/admin/2fa/enrolment', {
      method: 'POST',
      headers: { 'idempotency-key': crypto.randomUUID() },
    });
    return await relay(result);
  } catch {
    return problem(502, 'internal_error', 'The Delyva API is unreachable. Try again.');
  }
}
