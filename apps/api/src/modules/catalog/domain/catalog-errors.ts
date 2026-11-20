/** Stable codes raised by the catalog context (subset of contracts ErrorCode). */
export type CatalogErrorCode = 'not_found' | 'forbidden' | 'conflict' | 'validation_failed';

/** Catalog domain error; mapped to problem+json at the edge. */
export class CatalogError extends Error {
  /** @param code stable code @param message safe message without PII */
  constructor(
    readonly code: CatalogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogError';
  }
}
