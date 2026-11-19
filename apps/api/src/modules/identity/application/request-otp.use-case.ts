import { DomainError } from '../domain/identity-errors.js';
import { newOtpChallenge, OTP_LENGTH, OTP_TTL_MS } from '../domain/otp-challenge.js';
import type {
  Clock,
  OtpChallengeRepository,
  RateLimiter,
  SecretHasher,
  SmsSender,
} from './ports.js';

/** OTP send limits (SMS pumping is a direct cost). */
export const OTP_SEND_LIMITS = {
  perPhone: { limit: 3, windowSeconds: 600 },
  perIp: { limit: 10, windowSeconds: 600 },
  resendCooldownSeconds: 60,
} as const;

/** Dependencies of {@link RequestOtp}. */
export interface RequestOtpDeps {
  readonly otps: OtpChallengeRepository;
  readonly sms: SmsSender;
  readonly hasher: SecretHasher;
  readonly limiter: RateLimiter;
  readonly clock: Clock;
}

/** Command: send a fresh 6-digit OTP to a phone. */
export class RequestOtp {
  /** @param deps ports */
  constructor(private readonly deps: RequestOtpDeps) {}

  /** Executes the command. @throws DomainError rate_limited */
  async execute(input: {
    phone: string;
    ip: string;
  }): Promise<{ expiresInSeconds: number; resendAfterSeconds: number }> {
    const { otps, sms, hasher, clock } = this.deps;
    const phoneHash = hasher.hash(`phone:${input.phone}`);
    await this.enforceLimits(phoneHash, input.ip);
    const code = hasher.randomDigits(OTP_LENGTH);
    const id = clock.uuid();
    await otps.create(
      newOtpChallenge(id, phoneHash, hasher.hash(`otp:${id}:${code}`), clock.now()),
    );
    await sms.sendOtp(input.phone, code);
    return {
      expiresInSeconds: OTP_TTL_MS / 1000,
      resendAfterSeconds: OTP_SEND_LIMITS.resendCooldownSeconds,
    };
  }

  private async enforceLimits(phoneHash: string, ip: string): Promise<void> {
    const { limiter, hasher } = this.deps;
    const ipKey = hasher.hash(`ip:${ip}`);
    const checks = [
      limiter.hit(`rl:otp-send:cooldown:${phoneHash}`, 1, OTP_SEND_LIMITS.resendCooldownSeconds),
      limiter.hit(
        `rl:otp-send:phone:${phoneHash}`,
        OTP_SEND_LIMITS.perPhone.limit,
        OTP_SEND_LIMITS.perPhone.windowSeconds,
      ),
      limiter.hit(
        `rl:otp-send:ip:${ipKey}`,
        OTP_SEND_LIMITS.perIp.limit,
        OTP_SEND_LIMITS.perIp.windowSeconds,
      ),
    ];
    for (const result of await Promise.all(checks)) {
      if (!result.allowed) {
        throw new DomainError(
          'rate_limited',
          `Too many code requests. Try again in ${String(result.retryAfterSeconds)} seconds.`,
        );
      }
    }
  }
}
