import { DomainError } from '../domain/identity-errors.js';
import { checkOtpAttempt } from '../domain/otp-challenge.js';
import type {
  Clock,
  OtpChallengeRepository,
  RateLimiter,
  SecretHasher,
  UserRepository,
} from './ports.js';
import type { IssuedSession, SessionIssuer } from './session-issuer.js';

/** Verify attempts allowed per phone+IP per window (on top of 5 per challenge). */
export const OTP_VERIFY_LIMIT = { limit: 10, windowSeconds: 600 } as const;

/** Dependencies of {@link VerifyOtp}. */
export interface VerifyOtpDeps {
  readonly otps: OtpChallengeRepository;
  readonly users: UserRepository;
  readonly hasher: SecretHasher;
  readonly limiter: RateLimiter;
  readonly clock: Clock;
  readonly sessions: SessionIssuer;
}

/** Command: verify an OTP, find-or-create the user, issue a session. */
export class VerifyOtp {
  /** @param deps ports */
  constructor(private readonly deps: VerifyOtpDeps) {}

  /** Executes the command. @throws DomainError otp_* or rate_limited */
  async execute(input: {
    phone: string;
    code: string;
    deviceId: string;
    ip: string;
  }): Promise<IssuedSession> {
    const { otps, users, hasher, clock, sessions } = this.deps;
    const phoneHash = hasher.hash(`phone:${input.phone}`);
    await this.enforceLimit(phoneHash, input.ip);
    const challenge = await otps.findLatestActive(phoneHash);
    if (!challenge) throw new DomainError('otp_invalid', 'The code is incorrect or has expired.');
    const matches = hasher.equals(
      challenge.codeHash,
      hasher.hash(`otp:${challenge.id}:${input.code}`),
    );
    const result = checkOtpAttempt(challenge, matches, clock.now());
    await otps.save(result.next);
    if (!result.ok) throw result.error;
    const user = await users.findOrCreateByPhone(input.phone, phoneHash);
    return sessions.issue({ userId: user.userId, roles: user.roles, deviceId: input.deviceId });
  }

  private async enforceLimit(phoneHash: string, ip: string): Promise<void> {
    const key = `rl:otp-verify:${phoneHash}:${this.deps.hasher.hash(`ip:${ip}`)}`;
    const result = await this.deps.limiter.hit(
      key,
      OTP_VERIFY_LIMIT.limit,
      OTP_VERIFY_LIMIT.windowSeconds,
    );
    if (!result.allowed) {
      throw new DomainError(
        'rate_limited',
        `Too many attempts. Try again in ${String(result.retryAfterSeconds)} seconds.`,
      );
    }
  }
}
