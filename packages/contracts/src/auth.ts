import { z } from 'zod';

/** Nigerian mobile number in E.164 form: +234 followed by a 7/8/9 prefix and 9 more digits. */
export const NigeriaPhoneSchema = z
  .string()
  .regex(
    /^\+234[789][01]\d{8}$/,
    'Must be a Nigerian mobile number in E.164 form, e.g. +2348031234567',
  )
  .describe('Nigerian mobile number, E.164');

/** E.164 phone number (Nigeria at launch). */
export type NigeriaPhone = z.infer<typeof NigeriaPhoneSchema>;

/** Six-digit numeric OTP code. */
export const OtpCodeSchema = z.string().regex(/^\d{6}$/, 'OTP must be 6 digits');

/** Opaque device identifier the tokens are bound to. */
export const DeviceIdSchema = z.string().min(8).max(128);

/** OTP length in digits. */
export const OTP_LENGTH = 6;
/** OTP lifetime in seconds (5 minutes). */
export const OTP_TTL_SECONDS = 300;
/** Max verify attempts before the OTP is burned. */
export const MAX_OTP_ATTEMPTS = 5;
/** Access token lifetime in seconds (15 minutes). */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

/** POST /v1/auth/otp/request body. */
export const OtpRequestSchema = z.strictObject({ phone: NigeriaPhoneSchema });
/** POST /v1/auth/otp/request body. */
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

/** POST /v1/auth/otp/request 202 response. */
export const OtpRequestResponseSchema = z.strictObject({
  expiresInSeconds: z.number().int().positive(),
  resendAfterSeconds: z.number().int().nonnegative(),
});
/** POST /v1/auth/otp/request 202 response. */
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;

/** POST /v1/auth/otp/verify body. */
export const OtpVerifySchema = z.strictObject({
  phone: NigeriaPhoneSchema,
  code: OtpCodeSchema,
  deviceId: DeviceIdSchema,
});
/** POST /v1/auth/otp/verify body. */
export type OtpVerify = z.infer<typeof OtpVerifySchema>;

/** Token pair returned by verify and refresh. */
export const TokenPairSchema = z.strictObject({
  accessToken: z.string(),
  accessTokenExpiresIn: z.number().int().positive(),
  refreshToken: z.string(),
  tokenType: z.literal('Bearer'),
  userId: z.uuid(),
});
/** Token pair returned by verify and refresh. */
export type TokenPair = z.infer<typeof TokenPairSchema>;

/** POST /v1/auth/refresh body. */
export const RefreshRequestSchema = z.strictObject({
  refreshToken: z.string().min(20).max(256),
  deviceId: DeviceIdSchema,
});
/** POST /v1/auth/refresh body. */
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

/** POST /v1/auth/logout body. */
export const LogoutRequestSchema = z.strictObject({ refreshToken: z.string().min(20).max(256) });
/** POST /v1/auth/logout body. */
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

/** RBAC roles. */
export const RoleSchema = z.enum([
  'customer',
  'rider',
  'vendor_owner',
  'vendor_staff',
  'support',
  'ops',
  'finance',
  'super_admin',
]);
/** RBAC role. */
export type Role = z.infer<typeof RoleSchema>;
