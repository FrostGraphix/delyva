import { OtpRequestSchema } from '@delyva/contracts';
import type { NextRequest, NextResponse } from 'next/server';
import { callApi, csrfRejection, problem, relay } from '@/lib/server/bff';

/** POST /bff/auth/otp/request — validates the phone and asks the API to send an OTP. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const parsed = OtpRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return problem(400, 'validation_failed', 'Enter a valid Nigerian phone number.');
  try {
    const upstream = await callApi('/v1/auth/otp/request', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': req.headers.get('idempotency-key') ?? crypto.randomUUID(),
      },
      body: JSON.stringify(parsed.data),
    });
    return await relay({ upstream, refreshed: null });
  } catch {
    return problem(502, 'internal_error', 'The Delyva API is unreachable. Try again.');
  }
}
