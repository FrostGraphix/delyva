import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { OtpChallengeState } from '../domain/otp-challenge.js';
import type { RefreshTokenState } from '../domain/refresh-token.js';
import { Logout } from './logout.use-case.js';
import type {
  Clock,
  NewRefreshToken,
  OtpChallengeRepository,
  RateLimiter,
  RefreshTokenRepository,
  SecretHasher,
  SmsSender,
  UserRepository,
} from './ports.js';
import { RefreshSession } from './refresh-session.use-case.js';
import { RequestOtp } from './request-otp.use-case.js';
import { SessionIssuer } from './session-issuer.js';
import { VerifyOtp } from './verify-otp.use-case.js';

class FakeOtps implements OtpChallengeRepository {
  rows: OtpChallengeState[] = [];
  create(s: OtpChallengeState): Promise<void> {
    this.rows.push(s);
    return Promise.resolve();
  }
  findLatestActive(phoneHash: string): Promise<OtpChallengeState | null> {
    return Promise.resolve(
      this.rows.filter((r) => r.phoneHash === phoneHash && !r.consumedAt).at(-1) ?? null,
    );
  }
  save(s: OtpChallengeState): Promise<void> {
    this.rows = this.rows.map((r) => (r.id === s.id ? s : r));
    return Promise.resolve();
  }
}

class FakeUsers implements UserRepository {
  byPhone = new Map<string, string>();
  findOrCreateByPhone(
    phone: string,
  ): Promise<{ userId: string; roles: string[]; created: boolean }> {
    const existing = this.byPhone.get(phone);
    if (existing) return Promise.resolve({ userId: existing, roles: ['customer'], created: false });
    const userId = randomUUID();
    this.byPhone.set(phone, userId);
    return Promise.resolve({ userId, roles: ['customer'], created: true });
  }
  rolesOf(): Promise<string[]> {
    return Promise.resolve(['customer']);
  }
}

class FakeRefresh implements RefreshTokenRepository {
  rows: (RefreshTokenState & { tokenHash: string })[] = [];
  create(t: NewRefreshToken): Promise<void> {
    this.rows.push({ ...t, usedAt: null, revokedAt: null });
    return Promise.resolve();
  }
  findByHash(h: string): Promise<RefreshTokenState | null> {
    return Promise.resolve(this.rows.find((r) => r.tokenHash === h) ?? null);
  }
  markUsed(id: string, at: Date): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id && !r.usedAt);
    if (!row) return Promise.resolve(false);
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, usedAt: at } : r));
    return Promise.resolve(true);
  }
  revokeFamily(familyId: string, at: Date): Promise<void> {
    this.rows = this.rows.map((r) => (r.familyId === familyId ? { ...r, revokedAt: at } : r));
    return Promise.resolve();
  }
}

class FakeSms implements SmsSender {
  last: { phone: string; code: string } | undefined;
  sendOtp(phone: string, code: string): Promise<void> {
    this.last = { phone, code };
    return Promise.resolve();
  }
}

const hasher: SecretHasher = {
  hash: (v) => createHash('sha256').update(v).digest('hex'),
  equals: (a, b) => a === b,
  randomDigits: () => '123456',
  randomToken: () => randomUUID() + randomUUID(),
};

class FakeLimiter implements RateLimiter {
  counts = new Map<string, number>();
  hit(key: string, limit: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const n = (this.counts.get(key) ?? 0) + 1;
    if (n > limit) return Promise.resolve({ allowed: false, retryAfterSeconds: 30 });
    this.counts.set(key, n);
    return Promise.resolve({ allowed: true, retryAfterSeconds: 0 });
  }
}

const clock: Clock = { now: () => new Date('2026-01-01T10:00:00Z'), uuid: () => randomUUID() };
const phone = '+2348031234567';
const deviceId = 'device-abc-123';

function setup() {
  const otps = new FakeOtps();
  const users = new FakeUsers();
  const refreshTokens = new FakeRefresh();
  const sms = new FakeSms();
  const limiter = new FakeLimiter();
  const signer = { sign: () => Promise.resolve({ token: 'jwt', expiresIn: 900 }) };
  const sessions = new SessionIssuer({ refreshTokens, signer, hasher, clock });
  return {
    otps,
    sms,
    refreshTokens,
    request: new RequestOtp({ otps, sms, hasher, limiter, clock }),
    verify: new VerifyOtp({ otps, users, hasher, limiter, clock, sessions }),
    refresh: new RefreshSession({ refreshTokens, users, hasher, clock, sessions }),
    logout: new Logout({ refreshTokens, hasher, clock }),
  };
}

describe('identity use cases', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });

  it('stores only a hash of the OTP and sends the code by SMS', async () => {
    const res = await s.request.execute({ phone, ip: '1.1.1.1' });
    expect(res).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(s.sms.last?.code).toBe('123456');
    expect(JSON.stringify(s.otps.rows)).not.toContain('123456');
  });

  it('enforces the resend cooldown', async () => {
    await s.request.execute({ phone, ip: '1.1.1.1' });
    await expect(s.request.execute({ phone, ip: '1.1.1.1' })).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('verifies a correct OTP and issues tokens', async () => {
    await s.request.execute({ phone, ip: '1.1.1.1' });
    const session = await s.verify.execute({ phone, code: '123456', deviceId, ip: '1.1.1.1' });
    expect(session.accessToken).toBe('jwt');
    expect(session.refreshToken.length).toBeGreaterThan(20);
  });

  it('rejects a wrong OTP and a missing challenge', async () => {
    await expect(
      s.verify.execute({ phone, code: '000000', deviceId, ip: '1.1.1.1' }),
    ).rejects.toMatchObject({ code: 'otp_invalid' });
    await s.request.execute({ phone, ip: '1.1.1.1' });
    await expect(
      s.verify.execute({ phone, code: '000000', deviceId, ip: '1.1.1.1' }),
    ).rejects.toMatchObject({ code: 'otp_invalid' });
  });

  it('rate limits verify per phone and IP', async () => {
    await s.request.execute({ phone, ip: '1.1.1.1' });
    const attempts = Array.from({ length: 10 }, () =>
      s.verify.execute({ phone, code: '000000', deviceId, ip: '2.2.2.2' }).catch((e: unknown) => e),
    );
    await Promise.all(attempts);
    await expect(
      s.verify.execute({ phone, code: '123456', deviceId, ip: '2.2.2.2' }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    await s.request.execute({ phone, ip: '1.1.1.1' });
    const first = await s.verify.execute({ phone, code: '123456', deviceId, ip: '1.1.1.1' });
    const second = await s.refresh.execute({ refreshToken: first.refreshToken, deviceId });
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(
      s.refresh.execute({ refreshToken: first.refreshToken, deviceId }),
    ).rejects.toMatchObject({ code: 'refresh_token_reused' });
    await expect(
      s.refresh.execute({ refreshToken: second.refreshToken, deviceId }),
    ).rejects.toMatchObject({ code: 'refresh_token_reused' });
  });

  it('rejects unknown refresh tokens and other devices', async () => {
    await expect(
      s.refresh.execute({ refreshToken: 'nope'.repeat(10), deviceId }),
    ).rejects.toMatchObject({ code: 'refresh_token_invalid' });
    await s.request.execute({ phone, ip: '1.1.1.1' });
    const first = await s.verify.execute({ phone, code: '123456', deviceId, ip: '1.1.1.1' });
    await expect(
      s.refresh.execute({ refreshToken: first.refreshToken, deviceId: 'other-device' }),
    ).rejects.toMatchObject({ code: 'refresh_token_invalid' });
  });

  it('logout revokes the family and ignores unknown tokens', async () => {
    await s.request.execute({ phone, ip: '1.1.1.1' });
    const first = await s.verify.execute({ phone, code: '123456', deviceId, ip: '1.1.1.1' });
    await s.logout.execute({ refreshToken: first.refreshToken });
    await s.logout.execute({ refreshToken: 'unknown'.repeat(5) });
    expect(s.refreshTokens.rows.every((r) => r.revokedAt)).toBe(true);
  });
});
