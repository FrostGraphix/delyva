import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, otpauthUri, totpStep, verifyTotp } from './totp.js';

// RFC 6238 Appendix B (SHA-1) secret: ASCII "12345678901234567890".
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP (RFC 6238 / RFC 4226)', () => {
  it('matches the RFC 6238 SHA-1 test vectors (last 6 of the 8-digit values)', () => {
    expect(hotp(RFC_SECRET, totpStep(59_000), 8)).toBe('94287082');
    expect(hotp(RFC_SECRET, totpStep(1_111_111_109_000), 8)).toBe('07081804');
    expect(hotp(RFC_SECRET, totpStep(2_000_000_000_000), 8)).toBe('69279037');
    expect(hotp(RFC_SECRET, totpStep(59_000))).toBe('287082');
  });

  it('matches the RFC 4226 HOTP vectors', () => {
    expect([0, 1, 9].map((c) => hotp(RFC_SECRET, c))).toEqual(['755224', '287082', '520489']);
  });

  it('accepts the current code and ±1 step of drift, rejects wrong codes and 2 steps', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step), now, null)).toBe(step);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), now, null)).toBeNull();
    expect(
      verifyTotp(RFC_SECRET, '000000' === hotp(RFC_SECRET, step) ? '111111' : '000000', now, null),
    ).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abc', now, null)).toBeNull();
  });

  it('rejects replay of the same or an older step', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), now, step - 1)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now, step - 1)).toBe(step);
  });

  it('round-trips base32 and builds an otpauth URI', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('mzxw6ytboi======').toString()).toBe('foobar');
    expect(() => base32Decode('1!')).toThrow();
    expect(otpauthUri('Delyva', 'u1', 'ABC')).toBe(
      'otpauth://totp/Delyva%3Au1?secret=ABC&issuer=Delyva&algorithm=SHA1&digits=6&period=30',
    );
  });
});
