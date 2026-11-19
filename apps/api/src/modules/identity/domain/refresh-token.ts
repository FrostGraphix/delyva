/** Refresh token lifetime in milliseconds (30 days). */
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Persisted refresh token (only the hash is stored). */
export interface RefreshTokenState {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly deviceId: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;
}

/** Decision for a presented refresh token. */
export type RefreshDecision = 'rotate' | 'reuse_detected' | 'invalid';

/**
 * Rotation policy: a token may be used once. Presenting an already-used or revoked token is
 * treated as theft and the whole family must be revoked.
 */
export function decideRefresh(
  token: RefreshTokenState,
  deviceId: string,
  now: Date,
): RefreshDecision {
  if (token.usedAt !== null || token.revokedAt !== null) return 'reuse_detected';
  if (token.deviceId !== deviceId) return 'invalid';
  if (now.getTime() > token.expiresAt.getTime()) return 'invalid';
  return 'rotate';
}
