import { OtpRequestSchema } from '@delyva/contracts';
import { type NextRequest, NextResponse } from 'next/server';
import { csrfGuard, problem } from '../../../../../lib/server/bff';
import { serverConfig } from '../../../../../lib/server/config';

/** POST /api/auth/otp/request — validates the phone and asks the API to send an OTP. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = csrfGuard(req, false);
  if (blocked) return blocked;
  const parsed = OtpRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, 'validation_failed', 'Enter a valid Nigerian number.');
  const key = req.headers.get('idempotency-key') ?? crypto.randomUUID();
  const res = await fetch(`${serverConfig().apiUrl}/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: JSON.stringify(parsed.data),
    signal: AbortSignal.timeout(15_000),
  });
  return new NextResponse(await res.arrayBuffer(), {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
