/** Stable codes raised by the dispatch context (all members of the contracts `ErrorCode` enum). */
export type DispatchErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'validation_failed'
  | 'rider_too_far'
  | 'offer_unavailable'
  | 'order_already_assigned'
  | 'rider_unavailable';

/** Domain error mapped to problem+json by the shared filter (via its `code`). */
export class DispatchError extends Error {
  /** @param code stable code @param message safe detail (no PII) */
  constructor(
    readonly code: DispatchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DispatchError';
  }
}
