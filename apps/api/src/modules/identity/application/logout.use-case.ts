import type { Clock, RefreshTokenRepository, SecretHasher } from './ports.js';

/** Dependencies of {@link Logout}. */
export interface LogoutDeps {
  readonly refreshTokens: RefreshTokenRepository;
  readonly hasher: SecretHasher;
  readonly clock: Clock;
}

/** Command: revoke the session family of a refresh token. Unknown tokens are a silent no-op. */
export class Logout {
  /** @param deps ports */
  constructor(private readonly deps: LogoutDeps) {}

  /** Executes the command. */
  async execute(input: { refreshToken: string }): Promise<void> {
    const { refreshTokens, hasher, clock } = this.deps;
    const token = await refreshTokens.findByHash(hasher.hash(`refresh:${input.refreshToken}`));
    if (token) await refreshTokens.revokeFamily(token.familyId, clock.now());
  }
}
