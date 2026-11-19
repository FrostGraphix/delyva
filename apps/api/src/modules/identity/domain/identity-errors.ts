/** Stable codes raised by the identity domain (subset of contracts ErrorCode). */
export type IdentityErrorCode =
  | 'otp_invalid'
  | 'otp_expired'
  | 'otp_attempts_exceeded'
  | 'rate_limited'
  | 'refresh_token_invalid'
  | 'refresh_token_reused';

/** Domain error with a stable code; mapped to problem+json at the edge. */
export class DomainError extends Error {
  /** @param code stable code @param message safe message without PII */
  constructor(
    readonly code: IdentityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
