import { hasConsoleRole } from '../roles';
import { decodeClaims } from './jwt';

/** What `GET /bff/auth/session` tells the page. Never contains a token other than CSRF. */
export interface SessionInfo {
  readonly signedIn: boolean;
  readonly roles: readonly string[];
  /** A 2FA session cookie is present (the API decides whether it is still valid). */
  readonly twoFactor: boolean;
  /** Synchroniser CSRF token to echo in `x-csrf-token`. */
  readonly csrf: string;
}

/** Builds the session view from an access token (or none). */
export function sessionInfo(
  accessToken: string | undefined,
  twoFactor: boolean,
  csrf: string,
): SessionInfo {
  const claims = accessToken ? decodeClaims(accessToken) : null;
  const roles = claims?.roles ?? [];
  const signedIn = claims !== null && hasConsoleRole(roles);
  return { signedIn, roles: signedIn ? roles : [], twoFactor: signedIn && twoFactor, csrf };
}
