import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Header carrying the CSRF token on mutations. */
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** A fresh random CSRF token. */
export function newCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Inputs of a CSRF decision (kept pure for tests). */
export interface CsrfInput {
  readonly method: string;
  readonly origin: string | null;
  readonly host: string | null;
  readonly cookieToken: string | undefined;
  readonly headerToken: string | null;
}

function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function tokensMatch(a: string | undefined, b: string | null): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Mutations must come from our own origin AND echo the httpOnly CSRF cookie in `x-csrf-token`
 * (synchroniser token delivered via the same-origin session endpoint). SameSite=Strict is a
 * third, independent layer.
 */
export function csrfAllowed(input: CsrfInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;
  return sameOrigin(input.origin, input.host) && tokensMatch(input.cookieToken, input.headerToken);
}
