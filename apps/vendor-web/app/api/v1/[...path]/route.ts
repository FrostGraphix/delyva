import type { NextRequest, NextResponse } from 'next/server';
import { forward } from '../../../../lib/server/bff';

interface Ctx {
  readonly params: Promise<{ path: string[] }>;
}

async function handle(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { path } = await ctx.params;
  return forward(req, `/v1/${path.map(encodeURIComponent).join('/')}`);
}

/** Same-origin BFF proxy to the allowlisted vendor API routes (ADR 0820). */
export const GET = handle;
/** @see GET */
export const POST = handle;
/** @see GET */
export const PUT = handle;
/** @see GET */
export const PATCH = handle;
/** @see GET */
export const DELETE = handle;
