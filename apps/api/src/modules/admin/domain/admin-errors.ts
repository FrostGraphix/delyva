/** Stable codes raised by the admin context (subset of contracts ErrorCode). */
export type AdminErrorCode =
  'conflict' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'two_factor_required' | 'not_found';

/** Admin domain error; mapped to problem+json at the edge. */
export class AdminError extends Error {
  /** @param code stable code @param message safe message without secrets */
  constructor(
    readonly code: AdminErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AdminError';
  }
}
