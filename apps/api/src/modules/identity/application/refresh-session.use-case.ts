import { DomainError } from '../domain/identity-errors.js';
import { decideRefresh } from '../domain/refresh-token.js';
import type { Clock, RefreshTokenRepository, SecretHasher, UserRepository } from './ports.js';
import type { IssuedSession, SessionIssuer } from './session-issuer.js';

/** Dependencies of {@link RefreshSession}. */
export interface RefreshSessionDeps {
  readonly refreshTokens: RefreshTokenRepository;
  readonly users: UserRepository;
  readonly hasher: SecretHasher;
  readonly clock: Clock;
  readonly sessions: SessionIssuer;
}

/** Command: rotate a refresh token; replay of a used token revokes the whole family. */
export class RefreshSession {
  /** @param deps ports */
  constructor(private readonly deps: RefreshSessionDeps) {}

  /** Executes the command. @throws DomainError refresh_token_invalid | refresh_token_reused */
  async execute(input: { refreshToken: string; deviceId: string }): Promise<IssuedSession> {
    const { refreshTokens, users, hasher, clock, sessions } = this.deps;
    const now = clock.now();
    const token = await refreshTokens.findByHash(hasher.hash(`refresh:${input.refreshToken}`));
    if (!token) throw invalid();
    const decision = decideRefresh(token, input.deviceId, now);
    if (decision === 'invalid') throw invalid();
    if (decision === 'reuse_detected' || !(await refreshTokens.markUsed(token.id, now))) {
      await refreshTokens.revokeFamily(token.familyId, now);
      throw new DomainError(
        'refresh_token_reused',
        'This session was revoked. Please sign in again.',
      );
    }
    const roles = await users.rolesOf(token.userId);
    return sessions.issue({
      userId: token.userId,
      roles,
      deviceId: input.deviceId,
      familyId: token.familyId,
    });
  }
}

function invalid(): DomainError {
  return new DomainError('refresh_token_invalid', 'The refresh token is invalid or expired.');
}
