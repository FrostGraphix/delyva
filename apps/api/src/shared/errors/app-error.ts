import type { ErrorCode } from '@delyva/contracts';

/** HTTP status for each stable error code. */
export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_failed: 400,
  not_found: 404,
  unauthorized: 401,
  forbidden: 403,
  conflict: 409,
  rate_limited: 429,
  otp_invalid: 401,
  otp_expired: 401,
  otp_attempts_exceeded: 429,
  refresh_token_invalid: 401,
  refresh_token_reused: 401,
  idempotency_key_required: 400,
  idempotency_key_conflict: 409,
  internal_error: 500,
  promo_ineligible: 422,
  zone_not_serviceable: 422,
  rider_too_far: 422,
  offer_unavailable: 409,
  order_already_assigned: 409,
  rider_unavailable: 409,
};

/** Error with a stable code, mapped to RFC 9457 problem+json by the exception filter. */
export class AppError extends Error {
  /**
   * @param code stable machine-readable code
   * @param detail safe human-readable explanation (no PII)
   * @param fieldErrors optional per-field validation errors
   */
  constructor(
    readonly code: ErrorCode,
    readonly detail: string,
    readonly fieldErrors?: readonly { path: string; message: string }[],
  ) {
    super(detail);
    this.name = 'AppError';
  }

  /** HTTP status for this error. */
  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}
