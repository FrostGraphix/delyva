import type { NextRequest, NextResponse } from 'next/server';
import { callAsAdmin, csrfRejection, problem, readSession, relay } from '@/lib/server/bff';

const SEGMENT = /^[A-Za-z0-9._~-]+$/;
const FORWARDED = ['content-type', 'idempotency-key'] as const;

interface Ctx {
  readonly params: Promise<{ path: string[] }>;
}

/**
 * Same-origin proxy for `/v1/admin/*` only. Adds the bearer token and `x-admin-2fa` from
 * httpOnly cookies server-side; mutations must pass the CSRF check first.
 */
async function handle(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const rejected = csrfRejection(req);
  if (rejected) return rejected;
  const { path } = await ctx.params;
  if (path.length === 0 || !path.every((s) => SEGMENT.test(s) && s !== '..' && s !== '.')) {
    return problem(404, 'not_found', 'Unknown admin route.');
  }
  const headers: Record<string, string> = {};
  for (const name of FORWARDED) {
    const value = req.headers.get(name);
    if (value) headers[name] = value;
  }
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(req.method);
  const target = `/v1/admin/${path.join('/')}${req.nextUrl.search}`;
  try {
    const result = await callAsAdmin(readSession(req), target, {
      method: req.method,
      headers,
      ...(hasBody ? { body: await req.text() } : {}),
    });
    return await relay(result);
  } catch {
    return problem(502, 'internal_error', 'The Delyva API is unreachable. Try again.');
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
