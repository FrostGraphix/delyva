import { DomainError } from './identity-errors.js';

/** OTP length in digits. */
export const OTP_LENGTH = 6;
/** OTP lifetime in milliseconds (5 minutes). */
export const OTP_TTL_MS = 5 * 60 * 1000;
/** Maximum verification attempts per challenge. */
export const MAX_OTP_ATTEMPTS = 5;

/** Persisted state of one OTP challenge. The code itself is only ever stored hashed. */
export interface OtpChallengeState {
  readonly id: string;
  readonly phoneHash: string;
  readonly codeHash: string;
  readonly expiresAt: Date;
  readonly attempts: number;
  readonly consumedAt: Date | null;
}

/** Result of checking a submitted code. */
export type OtpCheck =
  | { readonly ok: true; readonly next: OtpChallengeState }
  | { readonly ok: false; readonly next: OtpChallengeState; readonly error: DomainError };

/**
 * Applies one verification attempt. `codeMatches` is computed by the caller with a
 * constant-time comparison of hashes, keeping this function pure.
 */
export function checkOtpAttempt(
  state: OtpChallengeState,
  codeMatches: boolean,
  now: Date,
): OtpCheck {
  if (state.consumedAt !== null) {
    return {
      ok: false,
      next: state,
      error: new DomainError('otp_invalid', 'This code has already been used.'),
    };
  }
  if (now.getTime() > state.expiresAt.getTime()) {
    return {
      ok: false,
      next: state,
      error: new DomainError('otp_expired', 'This code has expired. Request a new one.'),
    };
  }
  if (state.attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, next: state, error: tooManyAttempts() };
  }
  const attempted = { ...state, attempts: state.attempts + 1 };
  if (!codeMatches) {
    const error =
      attempted.attempts >= MAX_OTP_ATTEMPTS
        ? tooManyAttempts()
        : new DomainError('otp_invalid', 'The code is incorrect.');
    return { ok: false, next: attempted, error };
  }
  return { ok: true, next: { ...attempted, consumedAt: now } };
}

function tooManyAttempts(): DomainError {
  return new DomainError('otp_attempts_exceeded', 'Too many attempts. Request a new code.');
}

/** Builds a new challenge for a phone (hashes are supplied by the caller). */
export function newOtpChallenge(
  id: string,
  phoneHash: string,
  codeHash: string,
  now: Date,
): OtpChallengeState {
  return {
    id,
    phoneHash,
    codeHash,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    attempts: 0,
    consumedAt: null,
  };
}
