import type { NextRequest, NextResponse } from 'next/server';
import { exchangeTotp } from '@/lib/server/two-factor';

/** POST /bff/auth/2fa/verify — TOTP code for an enrolled admin → 2FA cookie. */
export function POST(req: NextRequest): Promise<NextResponse> {
  return exchangeTotp(req, '/v1/admin/2fa/verify');
}
