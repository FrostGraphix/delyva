/** Stable codes raised by the ordering domain (subset of contracts ErrorCode). */
export type OrderingErrorCode =
  | 'validation_failed'
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'zone_not_serviceable'
  | 'promo_ineligible';

/** Domain error mapped to problem+json by the global filter (via its `code`). */
export class OrderingError extends Error {
  /** @param code stable code @param message safe message (no PII) */
  constructor(
    readonly code: OrderingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OrderingError';
  }
}
