import { REFRESH_TTL_MS } from '../domain/refresh-token.js';
import type { AccessTokenSigner, Clock, RefreshTokenRepository, SecretHasher } from './ports.js';

/** Issued token pair. */
export interface IssuedSession {
  readonly accessToken: string;
  readonly accessTokenExpiresIn: number;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly userId: string;
}

/** Dependencies of {@link SessionIssuer}. */
export interface SessionIssuerDeps {
  readonly refreshTokens: RefreshTokenRepository;
  readonly signer: AccessTokenSigner;
  readonly hasher: SecretHasher;
  readonly clock: Clock;
}

/** Issues an access JWT + a new opaque refresh token in a (new or existing) family. */
export class SessionIssuer {
  /** @param deps ports */
  constructor(private readonly deps: SessionIssuerDeps) {}

  /** Issues a token pair bound to the device. */
  async issue(input: {
    userId: string;
    roles: string[];
    deviceId: string;
    familyId?: string;
  }): Promise<IssuedSession> {
    const { refreshTokens, signer, hasher, clock } = this.deps;
    const refreshToken = hasher.randomToken();
    await refreshTokens.create({
      id: clock.uuid(),
      userId: input.userId,
      familyId: input.familyId ?? clock.uuid(),
      deviceId: input.deviceId,
      tokenHash: hasher.hash(`refresh:${refreshToken}`),
      expiresAt: new Date(clock.now().getTime() + REFRESH_TTL_MS),
    });
    const access = await signer.sign({
      userId: input.userId,
      roles: input.roles,
      deviceId: input.deviceId,
    });
    return {
      accessToken: access.token,
      accessTokenExpiresIn: access.expiresIn,
      refreshToken,
      tokenType: 'Bearer',
      userId: input.userId,
    };
  }
}
