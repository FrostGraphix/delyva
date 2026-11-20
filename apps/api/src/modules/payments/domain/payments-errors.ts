/** Stable codes raised by the payments domain (subset of contracts ErrorCode). */
export type PaymentsErrorCode =
  'validation_failed' | 'not_found' | 'unauthorized' | 'forbidden' | 'conflict';

/** Payments domain error with a stable code; mapped to problem+json at the edge. */
export class PaymentsError extends Error {
  /** @param code stable code @param message safe message (no PII, no secrets) */
  constructor(
    readonly code: PaymentsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentsError';
  }
}

/** Thrown when a journal would break double-entry invariants. Always a programming error. */
export class LedgerInvariantError extends Error {
  /** @param message which invariant failed */
  constructor(message: string) {
    super(message);
    this.name = 'LedgerInvariantError';
  }
}
