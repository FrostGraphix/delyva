import { describe, expect, it } from 'vitest';
import { checkOtpAttempt, MAX_OTP_ATTEMPTS, newOtpChallenge, OTP_TTL_MS } from './otp-challenge.js';
import { decideRefresh, type RefreshTokenState } from './refresh-token.js';

const now = new Date('2026-01-01T10:00:00Z');
const later = (ms: number): Date => new Date(now.getTime() + ms);

describe('checkOtpAttempt', () => {
  const fresh = newOtpChallenge('c1', 'ph', 'ch', now);

  it('accepts a matching code and consumes the challenge', () => {
    const result = checkOtpAttempt(fresh, true, later(1000));
    expect(result.ok).toBe(true);
    expect(result.next.consumedAt).toEqual(later(1000));
    expect(result.next.attempts).toBe(1);
  });

  it('rejects a wrong code and counts the attempt', () => {
    const result = checkOtpAttempt(fresh, false, now);
    expect(result.ok).toBe(false);
    expect(result.next.attempts).toBe(1);
    expect(!result.ok && result.error.code).toBe('otp_invalid');
  });

  it('rejects after 5 minutes', () => {
    const result = checkOtpAttempt(fresh, true, later(OTP_TTL_MS + 1));
    expect(!result.ok && result.error.code).toBe('otp_expired');
  });

  it('locks after the fifth wrong attempt', () => {
    let state = fresh;
    let last = checkOtpAttempt(state, false, now);
    for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
      last = checkOtpAttempt(state, false, now);
      state = last.next;
    }
    expect(!last.ok && last.error.code).toBe('otp_attempts_exceeded');
    const afterLock = checkOtpAttempt(state, true, now);
    expect(!afterLock.ok && afterLock.error.code).toBe('otp_attempts_exceeded');
  });

  it('rejects an already consumed code', () => {
    const used = checkOtpAttempt(fresh, true, now).next;
    const again = checkOtpAttempt(used, true, now);
    expect(!again.ok && again.error.code).toBe('otp_invalid');
  });
});

describe('decideRefresh', () => {
  const token: RefreshTokenState = {
    id: 't1',
    userId: 'u1',
    familyId: 'f1',
    deviceId: 'device-1',
    expiresAt: later(60_000),
    usedAt: null,
    revokedAt: null,
  };

  it('rotates a fresh token', () => {
    expect(decideRefresh(token, 'device-1', now)).toBe('rotate');
  });

  it('detects reuse of a used or revoked token', () => {
    expect(decideRefresh({ ...token, usedAt: now }, 'device-1', now)).toBe('reuse_detected');
    expect(decideRefresh({ ...token, revokedAt: now }, 'device-1', now)).toBe('reuse_detected');
  });

  it('rejects a different device or an expired token', () => {
    expect(decideRefresh(token, 'device-2', now)).toBe('invalid');
    expect(decideRefresh(token, 'device-1', later(120_000))).toBe('invalid');
  });
});
