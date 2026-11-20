import type { KeyObject } from 'node:crypto';
import { type Role, RoleSchema } from '@delyva/contracts';
import { jwtVerify } from 'jose';

/** Authenticated caller derived from a verified access JWT. */
export interface Principal {
  readonly userId: string;
  readonly roles: readonly Role[];
  readonly deviceId: string;
}

/** Verifies access tokens; returns null for any invalid/expired token (never throws details). */
export interface AccessTokenVerifier {
  /** Verifies the compact JWT and returns the principal, or null. */
  verify(token: string): Promise<Principal | null>;
}

/** DI token for the {@link AccessTokenVerifier} (provided by the identity module). */
export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

/** jose-based EdDSA verifier bound to the identity signing key, issuer and audience. */
export class JoseAccessTokenVerifier implements AccessTokenVerifier {
  /** @param config public key and expected claims */
  constructor(private readonly config: { key: KeyObject; issuer: string; audience: string }) {}

  /** @inheritdoc */
  async verify(token: string): Promise<Principal | null> {
    try {
      const { payload } = await jwtVerify(token, this.config.key, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['EdDSA'],
      });
      const roles = RoleSchema.array().safeParse(payload.roles);
      if (!payload.sub || !roles.success || typeof payload.did !== 'string') return null;
      return { userId: payload.sub, roles: roles.data, deviceId: payload.did };
    } catch {
      return null;
    }
  }
}
