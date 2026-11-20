/** Stable codes raised by the geo context (subset of contracts ErrorCode). */
export type GeoErrorCode = 'not_found' | 'conflict' | 'validation_failed';

/** Geo domain error; mapped to problem+json at the edge. */
export class GeoError extends Error {
  /** @param code stable code @param message safe message without PII */
  constructor(
    readonly code: GeoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GeoError';
  }
}

/** Maximum saved addresses per customer (abuse guard). */
export const MAX_ADDRESSES_PER_USER = 20;
