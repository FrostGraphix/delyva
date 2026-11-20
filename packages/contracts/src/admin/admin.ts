import { z } from 'zod';
import { OtpCodeSchema } from '../auth.js';
import { ApplicationStatusSchema, KycStatusSchema } from '../onboarding/onboarding.js';

/** Header carrying the admin 2FA session token issued by POST /v1/admin/2fa/verify. */
export const ADMIN_2FA_HEADER = 'x-admin-2fa';

/** Roles that must pass TOTP 2FA before calling 2FA-protected admin routes. */
export const TWO_FACTOR_ROLES = ['support', 'ops', 'finance', 'super_admin'] as const;

/** Reason for an admin action that changes roles, money or approval state (audit logged). */
export const AdminReasonSchema = z.string().trim().min(5).max(500);

/** POST /v1/admin/{rider,vendor}-applications/{id}/approve|reject body. */
export const ReviewDecisionSchema = z.strictObject({ reason: AdminReasonSchema });
/** Review decision body. */
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

/** GET /v1/admin/{rider,vendor}-applications query. */
export const ListApplicationsQuerySchema = z.strictObject({
  status: ApplicationStatusSchema.exclude(['not_started']).default('pending_review'),
});
/** List applications query. */
export type ListApplicationsQuery = z.infer<typeof ListApplicationsQuerySchema>;

/** One rider application in the ops review queue (masked PII). */
export const AdminRiderApplicationSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  status: ApplicationStatusSchema,
  fullName: z.string().nullable(),
  vehicleType: z.string().nullable(),
  kycStatus: KycStatusSchema,
  bankNameMatch: z.boolean().nullable(),
  quizScorePercent: z.number().int().nullable(),
  documentUploadIds: z.array(z.uuid()),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
});
/** Rider application (admin view). */
export type AdminRiderApplication = z.infer<typeof AdminRiderApplicationSchema>;

/** GET /v1/admin/rider-applications response. */
export const AdminRiderApplicationListSchema = z.strictObject({
  items: z.array(AdminRiderApplicationSchema),
});
/** Rider application list. */
export type AdminRiderApplicationList = z.infer<typeof AdminRiderApplicationListSchema>;

/** One vendor application in the ops review queue. */
export const AdminVendorApplicationSchema = z.strictObject({
  id: z.uuid(),
  userId: z.uuid(),
  vendorId: z.uuid().nullable(),
  status: ApplicationStatusSchema,
  businessName: z.string().nullable(),
  cacNumber: z.string().nullable(),
  bankNameMatch: z.boolean().nullable(),
  draftMenuId: z.uuid().nullable(),
  menuItems: z.number().int(),
  documentUploadIds: z.array(z.uuid()),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
});
/** Vendor application (admin view). */
export type AdminVendorApplication = z.infer<typeof AdminVendorApplicationSchema>;

/** GET /v1/admin/vendor-applications response. */
export const AdminVendorApplicationListSchema = z.strictObject({
  items: z.array(AdminVendorApplicationSchema),
});
/** Vendor application list. */
export type AdminVendorApplicationList = z.infer<typeof AdminVendorApplicationListSchema>;

/** Feature flag key, e.g. `onboarding.rider_applications`. */
export const FeatureFlagKeySchema = z.string().regex(/^[a-z][a-z0-9_.-]{1,63}$/);

/** A feature flag. */
export const FeatureFlagSchema = z.strictObject({
  key: FeatureFlagKeySchema,
  enabled: z.boolean(),
  description: z.string(),
  updatedBy: z.uuid().nullable(),
  updatedAt: z.iso.datetime(),
});
/** Feature flag. */
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

/** GET /v1/admin/feature-flags response. */
export const FeatureFlagListSchema = z.strictObject({ items: z.array(FeatureFlagSchema) });
/** Feature flag list. */
export type FeatureFlagList = z.infer<typeof FeatureFlagListSchema>;

/** PUT /v1/admin/feature-flags body (upsert by key; audit logged with the reason). */
export const UpsertFeatureFlagSchema = z.strictObject({
  key: FeatureFlagKeySchema,
  enabled: z.boolean(),
  description: z.string().trim().max(300).optional(),
  reason: AdminReasonSchema,
});
/** Upsert feature flag body. */
export type UpsertFeatureFlag = z.infer<typeof UpsertFeatureFlagSchema>;

/** POST /v1/admin/2fa/enrolment response: show `otpauthUri` as a QR code once. */
export const TotpEnrolmentSchema = z.strictObject({
  secret: z.string(),
  otpauthUri: z.string(),
  digits: z.literal(6),
  periodSeconds: z.literal(30),
});
/** TOTP enrolment. */
export type TotpEnrolment = z.infer<typeof TotpEnrolmentSchema>;

/** Body carrying a 6-digit TOTP code. */
export const TotpCodeSchema = z.strictObject({ code: OtpCodeSchema });
/** TOTP code body. */
export type TotpCode = z.infer<typeof TotpCodeSchema>;

/** Admin 2FA session; send `token` in the `x-admin-2fa` header on protected admin routes. */
export const AdminTwoFactorSessionSchema = z.strictObject({
  token: z.string(),
  expiresInSeconds: z.number().int().positive(),
});
/** Admin 2FA session. */
export type AdminTwoFactorSession = z.infer<typeof AdminTwoFactorSessionSchema>;

/** Known audit-log actions (the append-only `audit_log` table is the record; no event is emitted). */
export const AUDIT_ACTIONS = [
  'rider_application.approved',
  'rider_application.rejected',
  'vendor_application.approved',
  'vendor_application.rejected',
  'feature_flag.updated',
  'admin_2fa.enrolled',
  'upload.download_url_issued',
] as const;
/** Known audit action. */
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
