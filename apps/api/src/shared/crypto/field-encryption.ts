import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** DI token for the {@link FieldEncryptor}. */
export const FIELD_ENCRYPTOR = Symbol('FIELD_ENCRYPTOR');

const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const KID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** A named AES-256 key. */
export interface FieldKey {
  readonly kid: string;
  readonly key: Buffer;
}

/**
 * Field-level encryption for PII columns (NIN, bank account numbers, guarantor phone, TOTP
 * secrets): AES-256-GCM with a random 96-bit IV and the column context as AAD, so a ciphertext
 * cannot be moved to another row or column. Envelope: `v1.<kid>.<iv>.<tag>.<ciphertext>`
 * (base64url). The key id travels in the envelope so old rows stay readable after rotation:
 * add the new key, make it active, re-encrypt lazily, then retire the old key.
 */
export class FieldEncryptor {
  private readonly keys: ReadonlyMap<string, Buffer>;

  /** @param keyring all readable keys @param activeKid the key used for new ciphertexts */
  constructor(
    keyring: readonly FieldKey[],
    private readonly activeKid: string,
  ) {
    for (const k of keyring) {
      if (!KID_PATTERN.test(k.kid)) throw new Error('field encryption: invalid key id');
      if (k.key.length !== KEY_BYTES) throw new Error('field encryption: keys must be 32 bytes');
    }
    this.keys = new Map(keyring.map((k) => [k.kid, k.key]));
    if (!this.keys.has(activeKid))
      throw new Error('field encryption: active key id not in keyring');
  }

  /** Encrypts `plaintext` bound to `context` (e.g. `rider_applications.nin:<id>`). */
  encrypt(plaintext: string, context: string): string {
    const key = this.keys.get(this.activeKid);
    if (!key) throw new Error('field encryption: active key missing');
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const parts = [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url'));
    return [VERSION, this.activeKid, ...parts].join('.');
  }

  /** Decrypts an envelope produced by {@link encrypt} with the same `context`. @throws on tamper */
  decrypt(envelope: string, context: string): string {
    const [version, kid, iv, tag, ct] = envelope.split('.');
    if (version !== VERSION || !kid || iv === undefined || !tag || ct === undefined) {
      throw new Error('field encryption: malformed envelope');
    }
    const key = this.keys.get(kid);
    if (!key) throw new Error('field encryption: unknown key id');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const pt = Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]);
    return pt.toString('utf8');
  }

  /** Key id of an envelope (for rotation jobs). */
  static keyIdOf(envelope: string): string | null {
    return envelope.split('.')[1] ?? null;
  }
}

/**
 * Parses `FIELD_ENCRYPTION_KEYS` (`kid:base64key,kid2:base64key`). When empty (non-production
 * only, enforced by env validation) a deterministic dev key is derived from the hash pepper so
 * local data survives restarts.
 */
export function buildFieldEncryptor(input: {
  keys: string;
  activeKid: string;
  devPepper: string;
}): FieldEncryptor {
  if (input.keys.trim() === '') {
    const key = Buffer.from(hkdfSync('sha256', input.devPepper, 'delyva', 'field-enc-dev', 32));
    return new FieldEncryptor([{ kid: 'dev', key }], 'dev');
  }
  const keyring = input.keys.split(',').map((entry) => {
    const [kid, b64] = entry.trim().split(':');
    if (!kid || !b64) throw new Error('FIELD_ENCRYPTION_KEYS entries must be kid:base64key');
    return { kid, key: Buffer.from(b64, 'base64') };
  });
  return new FieldEncryptor(keyring, input.activeKid);
}
