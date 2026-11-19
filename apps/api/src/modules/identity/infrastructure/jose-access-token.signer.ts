import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import { ACCESS_TOKEN_TTL_SECONDS } from '@delyva/contracts';
import { exportJWK, type JWK, SignJWT } from 'jose';
import type { AccessTokenSigner } from '../application/ports.js';

/** Signing configuration. */
export interface SignerConfig {
  readonly privateKeyPemB64: string;
  readonly keyId: string;
  readonly issuer: string;
  readonly audience: string;
}

/**
 * EdDSA (Ed25519) access-token signer. With no key configured (non-production only, enforced by
 * env validation) an ephemeral key is generated at boot.
 * DEBT(identity): single active key — rotation needs previous public keys in JWKS — load a key set from Secrets Manager.
 */
export class JoseAccessTokenSigner implements AccessTokenSigner {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  /** @param config signing config */
  constructor(private readonly config: SignerConfig) {
    this.privateKey = config.privateKeyPemB64
      ? createPrivateKey(Buffer.from(config.privateKeyPemB64, 'base64').toString('utf8'))
      : generateKeyPairSync('ed25519').privateKey;
    this.publicKey = createPublicKey(this.privateKey);
  }

  /** @inheritdoc */
  async sign(claims: {
    userId: string;
    roles: string[];
    deviceId: string;
  }): Promise<{ token: string; expiresIn: number }> {
    const token = await new SignJWT({ roles: claims.roles, did: claims.deviceId })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.config.keyId, typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt()
      .setExpirationTime(`${String(ACCESS_TOKEN_TTL_SECONDS)}s`)
      .sign(this.privateKey);
    return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  /** Public JWKS for verifiers. */
  async jwks(): Promise<{ keys: JWK[] }> {
    const jwk = await exportJWK(this.publicKey);
    return { keys: [{ ...jwk, kid: this.config.keyId, alg: 'EdDSA', use: 'sig' }] };
  }

  /** Public key, for in-process verification and tests. */
  get verificationKey(): KeyObject {
    return this.publicKey;
  }
}
