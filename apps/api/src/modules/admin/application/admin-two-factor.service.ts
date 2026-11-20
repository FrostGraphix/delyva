import { createHash } from 'node:crypto';
import type { AdminTwoFactorSession, TotpEnrolment } from '@delyva/contracts';
import { AdminError } from '../domain/admin-errors.js';
import {
  base32Decode,
  base32Encode,
  otpauthUri,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  verifyTotp,
} from '../domain/totp.js';
import type { AuditService } from './audit.service.js';
import type {
  AdminClock,
  SecretCipher,
  TotpFactorRepository,
  TwoFactorSessionStore,
} from './ports.js';

const SECRET_BYTES = 20;
const context = (userId: string): string => `admin_totp_factors.secret:${userId}`;

/** Hash under which a 2FA session token is stored (the raw token is never persisted). */
export const hashSessionToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * TOTP (RFC 6238) second factor for admin roles. Enrol → confirm with the first code →
 * verify per sign-in to obtain a short-lived 2FA session token for the `x-admin-2fa` header.
 * Each time step is accepted once per user (replay protection), attempts are rate limited.
 */
export class AdminTwoFactor {
  /** @param deps storage, cipher, sessions, clock, audit and settings */
  constructor(
    private readonly deps: {
      factors: TotpFactorRepository;
      sessions: TwoFactorSessionStore;
      cipher: SecretCipher;
      clock: AdminClock;
      audit: AuditService;
      issuer: string;
      sessionTtlSeconds: number;
    },
  ) {}

  /** Starts (or restarts, while unconfirmed) enrolment. @throws AdminError conflict */
  async enrol(userId: string): Promise<TotpEnrolment> {
    const { factors, cipher, clock, issuer } = this.deps;
    const secret = base32Encode(clock.randomBytes(SECRET_BYTES));
    if (!(await factors.saveUnconfirmed(userId, cipher.encrypt(secret, context(userId))))) {
      throw new AdminError(
        'conflict',
        'Two-factor is already enrolled; ask a super admin to reset it.',
      );
    }
    return {
      secret,
      otpauthUri: otpauthUri(issuer, userId, secret),
      digits: TOTP_DIGITS,
      periodSeconds: TOTP_PERIOD_SECONDS,
    };
  }

  /** Confirms enrolment with a first valid code and opens a session. */
  async confirm(
    userId: string,
    code: string,
    roles: readonly string[],
  ): Promise<AdminTwoFactorSession> {
    const factor = await this.deps.factors.find(userId);
    if (!factor) throw new AdminError('conflict', 'Start two-factor enrolment first.');
    if (factor.confirmedAt) throw new AdminError('conflict', 'Two-factor is already confirmed.');
    const session = await this.check(
      userId,
      code,
      factor.secretCiphertext,
      factor.lastUsedStep,
      true,
    );
    await this.deps.audit.record({
      actorId: userId,
      actorRoles: roles,
      action: 'admin_2fa.enrolled',
      targetType: 'user',
      targetId: userId,
      reason: null,
      before: null,
      after: { method: 'totp' },
      ip: null,
    });
    return session;
  }

  /** Verifies a code for a confirmed factor and opens a session. */
  async verify(userId: string, code: string): Promise<AdminTwoFactorSession> {
    const factor = await this.deps.factors.find(userId);
    if (!factor?.confirmedAt) {
      throw new AdminError('two_factor_required', 'Enrol in two-factor authentication first.');
    }
    return this.check(userId, code, factor.secretCiphertext, factor.lastUsedStep, false);
  }

  /** True when `token` is a live session of `userId`. */
  async isSessionValid(userId: string, token: string): Promise<boolean> {
    return (await this.deps.sessions.userOf(hashSessionToken(token))) === userId;
  }

  private async check(
    userId: string,
    code: string,
    secretCiphertext: string,
    lastUsedStep: number | null,
    confirm: boolean,
  ): Promise<AdminTwoFactorSession> {
    const { sessions, cipher, clock, factors, sessionTtlSeconds } = this.deps;
    if (!(await sessions.allowAttempt(userId))) {
      throw new AdminError('rate_limited', 'Too many two-factor attempts; wait and retry.');
    }
    const secret = cipher.decrypt(secretCiphertext, context(userId));
    const step = verifyTotp(base32Decode(secret), code, clock.nowMs(), lastUsedStep);
    if (step === null || !(await factors.consumeStep(userId, step, confirm))) {
      throw new AdminError('unauthorized', 'The two-factor code is invalid or was already used.');
    }
    const token = clock.randomBytes(32).toString('base64url');
    await sessions.create(hashSessionToken(token), userId, sessionTtlSeconds);
    return { token, expiresInSeconds: sessionTtlSeconds };
  }
}
