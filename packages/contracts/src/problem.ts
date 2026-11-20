import { z } from 'zod';

/** Stable machine-readable error codes surfaced in problem+json `code`. */
export const ERROR_CODES = [
  'validation_failed',
  'not_found',
  'unauthorized',
  'forbidden',
  'conflict',
  'rate_limited',
  'otp_invalid',
  'otp_expired',
  'otp_attempts_exceeded',
  'refresh_token_invalid',
  'refresh_token_reused',
  'idempotency_key_required',
  'idempotency_key_conflict',
  'internal_error',
  'promo_ineligible',
  'zone_not_serviceable',
  'kyc_verification_failed',
  'bank_account_name_mismatch',
  'two_factor_required',
  'upload_rejected',
  'rider_too_far',
  'offer_unavailable',
  'order_already_assigned',
  'rider_unavailable',
] as const;

/** Error code enum. */
export const ErrorCodeSchema = z.enum(ERROR_CODES);
/** Error code. */
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** RFC 9457 problem details, extended with a stable `code` and `traceId`. */
export const ProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: ErrorCodeSchema,
  traceId: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
/** RFC 9457 problem details. */
export type Problem = z.infer<typeof ProblemSchema>;

/** Media type for problem responses. */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
