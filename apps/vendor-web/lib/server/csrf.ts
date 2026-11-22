import { timingSafeEqual } from 'node:crypto';

/** Header the browser echoes the CSRF cookie in (double-submit). */
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Inputs for a CSRF decision (plain values so it is unit-testable without Next). */
export interface CsrfInput {
  readonly method: string;
  /** `Origin` header (or null). */
  readonly origin: string | null;
  /** `Sec-Fetch-Site` header (or null). */
  readonly fetchSite: string | null;
  /** The request's own origin, e.g. `https://vendor.delyva.ng`. */
  readonly selfOrigin: string;
  readonly allowedOrigins: readonly string[];
  /** CSRF cookie value. */
  readonly cookieToken: string | undefined;
  /** CSRF header value. */
  readonly headerToken: string | null;
  /** Login/OTP endpoints run before a CSRF cookie exists: origin check only. */
  readonly requireToken: boolean;
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * CSRF defence for mutating requests (ADR 0820): the Origin must be our own (or allowlisted),
 * cross-site fetch metadata is refused, and — once a session exists — the `x-csrf-token` header
 * must equal the CSRF cookie. Returns a reason when the request must be rejected.
 */
export function csrfViolation(i: CsrfInput): string | null {
  if (SAFE_METHODS.has(i.method.toUpperCase())) return null;
  if (i.fetchSite === 'cross-site') return 'cross_site_request';
  if (!i.origin) return 'missing_origin';
  if (i.origin !== i.selfOrigin && !i.allowedOrigins.includes(i.origin)) return 'bad_origin';
  if (!i.requireToken) return null;
  if (!i.cookieToken || !i.headerToken) return 'missing_token';
  return sameToken(i.cookieToken, i.headerToken) ? null : 'token_mismatch';
}
