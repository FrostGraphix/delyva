import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { SecretHasher } from '../application/ports.js';

/** HMAC-SHA256 with a server-side pepper; CSPRNG for codes and tokens. */
export class CryptoSecretHasher implements SecretHasher {
  /** @param pepper secret from env (HASH_PEPPER) */
  constructor(private readonly pepper: string) {}

  /** @inheritdoc */
  hash(value: string): string {
    return createHmac('sha256', this.pepper).update(value).digest('hex');
  }

  /** @inheritdoc */
  equals(a: string, b: string): boolean {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  }

  /** @inheritdoc */
  randomDigits(length: number): string {
    return Array.from({ length }, () => String(randomInt(0, 10))).join('');
  }

  /** @inheritdoc */
  randomToken(): string {
    return randomBytes(32).toString('base64url');
  }
}
