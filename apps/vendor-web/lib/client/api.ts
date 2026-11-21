import { ApiError, DelyvaClient } from '@delyva/sdk';

/** Name of the JS-readable CSRF cookie (mirrors `COOKIE.csrf` on the server). */
export const CSRF_COOKIE = 'dv_csrf';

/** Reads a cookie value in the browser (only the non-httpOnly CSRF cookie is visible). */
export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined;
}

/** `fetch` that adds the double-submit CSRF header and sends same-origin cookies. */
export const csrfFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  const token = readCookie(CSRF_COOKIE);
  if (token) headers.set('x-csrf-token', token);
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
};

let client: DelyvaClient | null = null;

/**
 * Browser SDK client pointed at the same-origin BFF (`/api`). It carries no token: the Next
 * server attaches it from the httpOnly cookie (ADR 0820).
 */
export function browserClient(): DelyvaClient {
  client ??= new DelyvaClient({ baseUrl: `${window.location.origin}/api`, fetch: csrfFetch });
  return client;
}

/** True for a 401 from the BFF (session ended). */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && err.problem.status === 401;
}

/** POSTs JSON to a same-origin BFF route and returns the parsed body or throws {@link ApiError}. */
export async function postJson<T>(
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const res = await csrfFetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
  return parse<T>(res);
}

/** Uploads a file through the BFF (`/api/uploads`) and returns its upload id. */
export async function uploadFile(file: File, purpose: string): Promise<string> {
  const form = new FormData();
  form.set('purpose', purpose);
  form.set('file', file);
  const res = await csrfFetch('/api/uploads', { method: 'POST', body: form });
  return (await parse<{ uploadId: string }>(res)).uploadId;
}

async function parse<T>(res: Response): Promise<T> {
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const p = json as Partial<ApiError['problem']>;
    throw new ApiError({
      type: p.type ?? 'about:blank',
      title: p.title ?? 'Request failed',
      status: res.status,
      code: p.code ?? 'internal_error',
      ...(p.detail ? { detail: p.detail } : {}),
      ...(p.errors ? { errors: p.errors } : {}),
    });
  }
  return json as T;
}
