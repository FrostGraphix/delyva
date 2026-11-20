/** Stable codes raised by the onboarding context (subset of contracts ErrorCode). */
export type OnboardingErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'validation_failed'
  | 'rate_limited'
  | 'kyc_verification_failed'
  | 'bank_account_name_mismatch'
  | 'upload_rejected';

/** Onboarding domain error; mapped to problem+json at the edge. Messages never contain PII. */
export class OnboardingError extends Error {
  /** @param code stable code @param message safe message */
  constructor(
    readonly code: OnboardingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OnboardingError';
  }
}
