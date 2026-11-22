import { ApiError, DelyvaClient, parseProblem } from '@delyva/sdk';
import type { z } from 'zod';

let csrfToken = '';
let csrfLoading: Promise<void> | null = null;

/** Stores the CSRF token returned by `GET /bff/auth/session` (memory only, never storage). */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

/**
 * Makes sure a CSRF token is armed before any BFF call. A first-time visitor has no CSRF cookie
 * until `/bff/auth/session` answers, so a fast click must wait for it instead of being refused.
 */
async function ensureCsrf(): Promise<void> {
  if (csrfToken) return;
  csrfLoading ??= fetch('/bff/auth/session', { credentials: 'same-origin', cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as { csrf?: unknown };
      if (typeof body.csrf === 'string') csrfToken = body.csrf;
    })
    .finally(() => {
      csrfLoading = null;
    });
  await csrfLoading;
}

/** fetch that targets the same-origin BFF with the CSRF header; cookies travel automatically. */
export const bffFetch: typeof fetch = async (input, init) => {
  await ensureCsrf();
  const headers = new Headers(init?.headers);
  if (csrfToken) headers.set('x-csrf-token', csrfToken);
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
};

/**
 * The typed SDK pointed at the BFF. No token options: the BFF adds bearer + `x-admin-2fa`
 * server-side from httpOnly cookies (ADR 0830).
 */
export const adminClient = new DelyvaClient({ baseUrl: '/bff', fetch: bffFetch });

/** JSON POST to a BFF auth route; throws `ApiError` with the parsed problem on failure. */
export async function bffPost<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
): Promise<z.infer<S>> {
  const res = await bffFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new ApiError(await parseProblem(res));
  return schema.parse(res.status === 204 ? {} : await res.json());
}
