import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildFieldEncryptor, FieldEncryptor } from './field-encryption.js';

const k1 = { kid: 'k1', key: randomBytes(32) };
const k2 = { kid: 'k2', key: randomBytes(32) };

describe('FieldEncryptor', () => {
  it('round-trips and never contains the plaintext', () => {
    const enc = new FieldEncryptor([k1], 'k1');
    const ct = enc.encrypt('12345678901', 'riders.nin:a');
    expect(ct).not.toContain('12345678901');
    expect(ct.startsWith('v1.k1.')).toBe(true);
    expect(enc.decrypt(ct, 'riders.nin:a')).toBe('12345678901');
  });

  it('uses a fresh IV per encryption', () => {
    const enc = new FieldEncryptor([k1], 'k1');
    expect(enc.encrypt('x', 'c')).not.toBe(enc.encrypt('x', 'c'));
  });

  it('rejects a ciphertext moved to another context (AAD binding)', () => {
    const enc = new FieldEncryptor([k1], 'k1');
    const ct = enc.encrypt('0123456789', 'bank:row-1');
    expect(() => enc.decrypt(ct, 'bank:row-2')).toThrow();
  });

  it('rejects tampered and malformed envelopes', () => {
    const enc = new FieldEncryptor([k1], 'k1');
    const parts = enc.encrypt('secret', 'c').split('.');
    parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => enc.decrypt(parts.join('.'), 'c')).toThrow();
    expect(() => enc.decrypt('garbage', 'c')).toThrow(/malformed/);
    expect(() => enc.decrypt('v1.zz.a.b.c', 'c')).toThrow(/unknown key/);
  });

  it('decrypts old ciphertexts after rotating the active key', () => {
    const old = new FieldEncryptor([k1], 'k1').encrypt('v', 'c');
    const rotated = new FieldEncryptor([k1, k2], 'k2');
    expect(rotated.decrypt(old, 'c')).toBe('v');
    const fresh = rotated.encrypt('v', 'c');
    expect(FieldEncryptor.keyIdOf(fresh)).toBe('k2');
  });

  it('validates the keyring', () => {
    expect(() => new FieldEncryptor([k1], 'nope')).toThrow(/active key/);
    expect(() => new FieldEncryptor([{ kid: 'bad kid', key: k1.key }], 'bad kid')).toThrow();
    expect(() => new FieldEncryptor([{ kid: 'short', key: randomBytes(16) }], 'short')).toThrow();
  });

  it('builds from env strings, with a stable dev key when unset', () => {
    const env = `k1:${k1.key.toString('base64')},k2:${k2.key.toString('base64')}`;
    const enc = buildFieldEncryptor({ keys: env, activeKid: 'k2', devPepper: '' });
    expect(FieldEncryptor.keyIdOf(enc.encrypt('a', 'c'))).toBe('k2');
    const dev1 = buildFieldEncryptor({ keys: '', activeKid: 'x', devPepper: 'pepper-pepper' });
    const dev2 = buildFieldEncryptor({ keys: '', activeKid: 'x', devPepper: 'pepper-pepper' });
    expect(dev2.decrypt(dev1.encrypt('a', 'c'), 'c')).toBe('a');
    expect(() => buildFieldEncryptor({ keys: 'nokey', activeKid: 'x', devPepper: '' })).toThrow();
  });
});
