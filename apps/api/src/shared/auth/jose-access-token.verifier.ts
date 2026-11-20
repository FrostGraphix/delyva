import type { KeyObject } from 'node:crypto';
import { jwtVerify } from 'jose';
import type { AccessTokenVerifier, AuthPrincipal } from './auth.guard.js';

/** Verification settings matching the identity signer (EdDSA, issuer, audience). */
export interface VerifierConfig {
  readonly key: KeyObject;
  readonly issuer: string;
  readonly audience: string;
}

/** Verifies identity-issued EdDSA access JWTs in-process (claims: `sub`, `roles`). */
export class JoseAccessTokenVerifier implements AccessTokenVerifier {
  /** @param config verification settings */
  constructor(private readonly config: VerifierConfig) {}

  /** @inheritdoc */
  async verify(token: string): Promise<AuthPrincipal> {
    const { payload } = await jwtVerify(token, this.config.key, {
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithms: ['EdDSA'],
    });
    const roles = payload.roles;
    if (!payload.sub || !Array.isArray(roles) || !roles.every((r) => typeof r === 'string')) {
      throw new Error('access token is missing sub or roles');
    }
    return { userId: payload.sub, roles };
  }
}
