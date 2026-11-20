/** Stable codes raised by the pricing domain (subset of contracts `ErrorCode`). */
export type PricingErrorCode =
  'validation_failed' | 'zone_not_serviceable' | 'promo_ineligible' | 'not_found' | 'conflict';

/** Domain error with a stable code; the problem+json filter maps `code` to an HTTP status. */
export class PricingError extends Error {
  /**
   * @param code stable machine-readable code
   * @param message safe human-readable explanation (no PII)
   */
  constructor(
    readonly code: PricingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PricingError';
  }
}
