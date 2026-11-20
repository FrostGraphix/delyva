import type { KeyObject } from 'node:crypto';
import { RoleSchema, type Role } from '@delyva/contracts';
import { jwtVerify } from 'jose';
import { AppError } from '../errors/app-error.js';

/** Authenticated caller derived from a verified access JWT. */
export interface Principal {
  readonly userId: string;
  readonly roles: readonly Role[];
  readonly deviceId: string;
}

/** Verifies access tokens; used by the HTTP guard and the Socket.IO handshake. */
export interface AccessTokenVerifier {
  /** Returns the principal or throws `AppError('unauthorized')`. */
  verify(token: string): Promise<Principal>;
}

/** DI token for the {@link AccessTokenVerifier} (provided and exported by the identity module). */
export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');

/** Verifier options. */
export interface JwtVerifierConfig {
  readonly key: KeyObject;
  readonly issuer: string;
  readonly audience: string;
}

/** EdDSA access-token verifier (issuer, audience, expiry and claim shape are enforced). */
export class JoseAccessTokenVerifier implements AccessTokenVerifier {
  /** @param config verification key + expected iss/aud */
  constructor(private readonly config: JwtVerifierConfig) {}

  /** @inheritdoc */
  async verify(token: string): Promise<Principal> {
    try {
      const { payload } = await jwtVerify(token, this.config.key, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['EdDSA'],
      });
      const roles = RoleSchema.array().safeParse(payload.roles);
      if (!payload.sub || typeof payload.did !== 'string' || !roles.success) {
        throw new Error('malformed claims');
      }
      return { userId: payload.sub, roles: roles.data, deviceId: payload.did };
    } catch {
      throw new AppError('unauthorized', 'A valid access token is required.');
    }
  }
}

/** Extracts a bearer token from an `Authorization` header value. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer ([\w.-]+)$/.exec(header.trim());
  return match?.[1] ?? null;
}
