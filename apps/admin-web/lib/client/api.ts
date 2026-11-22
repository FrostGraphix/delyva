import { ApiError, DelyvaClient, parseProblem } from '@delyva/sdk';
import type { z } from 'zod';

let csrfToken = '';

/** Stores the CSRF token returned by `GET /bff/auth/session` (memory only, never storage). */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

/** fetch that targets the same-origin BFF with the CSRF header; cookies travel automatically. */
export const bffFetch: typeof fetch = (input, init) => {
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
