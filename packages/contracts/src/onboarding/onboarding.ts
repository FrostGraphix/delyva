import { z } from 'zod';
import { NigeriaPhoneSchema } from '../auth.js';
import { OpeningHoursEntrySchema, VendorCategorySchema } from '../catalog/catalog.js';

/** Which onboarding funnel an application belongs to. */
export const OnboardingKindSchema = z.enum(['rider', 'vendor']);
/** Onboarding funnel kind. */
export type OnboardingKind = z.infer<typeof OnboardingKindSchema>;

/** Rider application steps, in the order they must be completed (CLAUDE.md → Onboarding). */
export const RIDER_STEPS = [
  'personal_details',
  'identity',
  'vehicle',
  'guarantor',
  'bank_account',
  'training_quiz',
] as const;
/** Rider application step. */
export const RiderStepSchema = z.enum(RIDER_STEPS);
/** Rider application step. */
export type RiderStep = z.infer<typeof RiderStepSchema>;

/** Vendor application steps, in order. */
export const VENDOR_STEPS = [
  'business_details',
  'documents',
  'location',
  'menu',
  'bank_account',
  'test_order',
] as const;
/** Vendor application step. */
export const VendorStepSchema = z.enum(VENDOR_STEPS);
/** Vendor application step. */
export type VendorStep = z.infer<typeof VendorStepSchema>;

/** Application lifecycle. `not_started` is a view-only state (no row yet). */
export const ApplicationStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'pending_review',
  'approved',
  'rejected',
]);
/** Application lifecycle status. */
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

// ---------------------------------------------------------------- uploads

/** What an uploaded file is for; drives the MIME/size policy. All onboarding files are private. */
export const UploadPurposeSchema = z.enum([
  'selfie',
  'drivers_licence',
  'vehicle_photo',
  'cac_certificate',
  'owner_id',
  'menu_csv',
  'menu_photo',
]);
/** Upload purpose. */
export type UploadPurpose = z.infer<typeof UploadPurposeSchema>;

/** MIME types accepted for uploads. */
export const UploadContentTypeSchema = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/csv',
]);
/** Accepted upload MIME type. */
export type UploadContentType = z.infer<typeof UploadContentTypeSchema>;

/** POST /v1/uploads body: declare the file before uploading it. */
export const CreateUploadSchema = z.strictObject({
  purpose: UploadPurposeSchema,
  contentType: UploadContentTypeSchema,
  sizeBytes: z.number().int().positive(),
});
/** POST /v1/uploads body. */
export type CreateUpload = z.infer<typeof CreateUploadSchema>;

/** Signed, expiring upload ticket. PUT the raw bytes to `url` with `headers`. */
export const UploadTicketSchema = z.strictObject({
  uploadId: z.uuid(),
  method: z.literal('PUT'),
  url: z.string(),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
  maxSizeBytes: z.number().int().positive(),
});
/** Signed upload ticket. */
export type UploadTicket = z.infer<typeof UploadTicketSchema>;

/** Short-lived signed download URL (ops review of private files). */
export const DownloadUrlSchema = z.strictObject({ url: z.string(), expiresAt: z.iso.datetime() });
/** Signed download URL. */
export type DownloadUrl = z.infer<typeof DownloadUrlSchema>;

// ---------------------------------------------------------------- shared step bodies

/** ISO calendar date `YYYY-MM-DD`. */
export const IsoDateSchema = z.iso.date();

/** Bank account to resolve by name through the payment provider. */
export const BankAccountInputSchema = z.strictObject({
  bankCode: z.string().regex(/^\d{3,6}$/, 'Bank code is 3–6 digits'),
  accountNumber: z.string().regex(/^\d{10}$/, 'NUBAN account numbers have 10 digits'),
  /** Set after a `bank_account_name_mismatch` to keep the account and flag it for ops review. */
  confirmNameMismatch: z.boolean().optional(),
});
/** Bank account step body. */
export type BankAccountInput = z.infer<typeof BankAccountInputSchema>;

/** Masked bank account as stored (the full number is encrypted at rest). */
export const BankAccountSummarySchema = z.strictObject({
  bankCode: z.string(),
  accountNumberLast4: z.string(),
  accountName: z.string(),
  nameMatch: z.boolean(),
});
/** Masked bank account. */
export type BankAccountSummary = z.infer<typeof BankAccountSummarySchema>;

/** POST …/step-views body (funnel analytics). */
export const StepViewSchema = z.strictObject({ step: z.string().min(1).max(40) });
/** Step view body. */
export type StepView = z.infer<typeof StepViewSchema>;

// ---------------------------------------------------------------- rider

const NamePart = z.string().trim().min(1).max(60);

/** PUT /v1/rider-applications/me/personal-details */
export const RiderPersonalDetailsSchema = z.strictObject({
  firstName: NamePart,
  middleName: NamePart.optional(),
  lastName: NamePart,
  dateOfBirth: IsoDateSchema,
  stateOfResidence: z.string().trim().min(2).max(40),
});
/** Rider personal details. */
export type RiderPersonalDetails = z.infer<typeof RiderPersonalDetailsSchema>;

/** PUT /v1/rider-applications/me/identity — NIN + selfie for the KYC liveness check. */
export const RiderIdentitySchema = z.strictObject({
  nin: z.string().regex(/^\d{11}$/, 'NIN has 11 digits'),
  selfieUploadId: z.uuid(),
});
/** Rider identity step body. */
export type RiderIdentity = z.infer<typeof RiderIdentitySchema>;

/** Rider vehicle types. */
export const VehicleTypeSchema = z.enum(['motorcycle', 'bicycle', 'car', 'tricycle']);

/** PUT /v1/rider-applications/me/vehicle — motorised vehicles need plate and licence documents. */
export const RiderVehicleSchema = z
  .strictObject({
    vehicleType: VehicleTypeSchema,
    plateNumber: z.string().trim().min(5).max(12).optional(),
    licenceNumber: z.string().trim().min(5).max(20).optional(),
    licenceExpiry: IsoDateSchema.optional(),
    licenceUploadId: z.uuid().optional(),
    vehiclePhotoUploadId: z.uuid(),
  })
  .refine(
    (v) =>
      v.vehicleType === 'bicycle' ||
      (v.plateNumber !== undefined &&
        v.licenceNumber !== undefined &&
        v.licenceExpiry !== undefined &&
        v.licenceUploadId !== undefined),
    'Motorised vehicles need plateNumber, licenceNumber, licenceExpiry and licenceUploadId',
  );
/** Rider vehicle step body. */
export type RiderVehicle = z.infer<typeof RiderVehicleSchema>;

/** PUT /v1/rider-applications/me/guarantor */
export const RiderGuarantorSchema = z.strictObject({
  fullName: z.string().trim().min(3).max(120),
  phone: NigeriaPhoneSchema,
  relationship: z.string().trim().min(2).max(40),
});
/** Rider guarantor step body. */
export type RiderGuarantor = z.infer<typeof RiderGuarantorSchema>;

/** One training-quiz question as shown to the rider (no answers). */
export const QuizQuestionSchema = z.strictObject({
  id: z.string(),
  prompt: z.string(),
  options: z.array(z.strictObject({ id: z.string(), label: z.string() })),
});

/** GET /v1/rider-applications/me/quiz */
export const QuizSchema = z.strictObject({
  passMarkPercent: z.number().int(),
  questions: z.array(QuizQuestionSchema),
});
/** Training quiz. */
export type Quiz = z.infer<typeof QuizSchema>;

/** POST /v1/rider-applications/me/quiz — one answer per question. */
export const QuizSubmissionSchema = z.strictObject({
  answers: z
    .array(z.strictObject({ questionId: z.string().max(40), optionId: z.string().max(40) }))
    .min(1)
    .max(50),
});
/** Quiz answers. */
export type QuizSubmission = z.infer<typeof QuizSubmissionSchema>;

/** Server-scored quiz result. */
export const QuizResultSchema = z.strictObject({
  correct: z.number().int(),
  total: z.number().int(),
  scorePercent: z.number().int(),
  passed: z.boolean(),
  attempts: z.number().int(),
});
/** Quiz result. */
export type QuizResult = z.infer<typeof QuizResultSchema>;

/** KYC verification status. */
export const KycStatusSchema = z.enum(['not_started', 'verified', 'failed', 'manual_review']);

/** The rider's own application (status shown in-app). PII is masked. */
export const RiderApplicationSchema = z.strictObject({
  id: z.uuid().nullable(),
  status: ApplicationStatusSchema,
  currentStep: RiderStepSchema.nullable(),
  completedSteps: z.array(RiderStepSchema),
  personalDetails: RiderPersonalDetailsSchema.nullable(),
  identity: z
    .strictObject({
      ninLast4: z.string(),
      kycStatus: KycStatusSchema,
      kycFailureReason: z.string().nullable(),
    })
    .nullable(),
  vehicle: z
    .strictObject({
      vehicleType: VehicleTypeSchema,
      plateNumber: z.string().nullable(),
      licenceExpiry: z.string().nullable(),
    })
    .nullable(),
  guarantor: z
    .strictObject({ fullName: z.string(), relationship: z.string(), phoneLast4: z.string() })
    .nullable(),
  bankAccount: BankAccountSummarySchema.nullable(),
  quiz: z
    .strictObject({ passed: z.boolean(), scorePercent: z.number().int(), attempts: z.number() })
    .nullable(),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
});
/** Rider application view. */
export type RiderApplication = z.infer<typeof RiderApplicationSchema>;

// ---------------------------------------------------------------- vendor

/** PUT /v1/vendor-applications/me/business-details — creates/updates the draft catalog vendor. */
export const VendorBusinessDetailsSchema = z.strictObject({
  businessName: z.string().trim().min(2).max(80),
  category: VendorCategorySchema,
  description: z.string().trim().max(500).optional(),
});
/** Vendor business details. */
export type VendorBusinessDetails = z.infer<typeof VendorBusinessDetailsSchema>;

/** Owner ID document types. */
export const OwnerIdTypeSchema = z.enum([
  'nin',
  'drivers_licence',
  'international_passport',
  'voters_card',
]);

/** PUT /v1/vendor-applications/me/documents — CAC registration and owner ID. */
export const VendorDocumentsSchema = z.strictObject({
  cacNumber: z.string().regex(/^(RC|BN|IT)?\d{4,8}$/i, 'CAC number like RC123456 or BN1234567'),
  cacCertificateUploadId: z.uuid(),
  ownerIdType: OwnerIdTypeSchema,
  ownerIdNumber: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{6,20}$/i),
  ownerIdUploadId: z.uuid(),
});
/** Vendor documents step body. */
export type VendorDocuments = z.infer<typeof VendorDocumentsSchema>;

/** PUT /v1/vendor-applications/me/location — branch pin and weekly opening hours. */
export const VendorLocationSchema = z.strictObject({
  branchName: z.string().trim().min(2).max(80),
  addressLine: z.string().trim().min(5).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  prepMinutes: z.number().int().min(0).max(240),
  openingHours: z.array(OpeningHoursEntrySchema).min(1).max(42),
});
/** Vendor location step body. */
export type VendorLocation = z.infer<typeof VendorLocationSchema>;

/** POST /v1/vendor-applications/me/menu-import — parse an uploaded CSV into a draft menu. */
export const MenuImportSchema = z.strictObject({ csvUploadId: z.uuid() });
/** Menu import body. */
export type MenuImport = z.infer<typeof MenuImportSchema>;

/** Menu import result (the draft menu is inactive until ops approves the vendor). */
export const MenuImportResultSchema = z.strictObject({
  draftMenuId: z.uuid(),
  categories: z.number().int(),
  items: z.number().int(),
});
/** Menu import result. */
export type MenuImportResult = z.infer<typeof MenuImportResultSchema>;

/** PUT /v1/vendor-applications/me/menu-photos — photo-of-menu files kept for ops. */
export const MenuPhotosSchema = z.strictObject({ uploadIds: z.array(z.uuid()).min(1).max(10) });
/** Menu photos body. */
export type MenuPhotos = z.infer<typeof MenuPhotosSchema>;

/** CSV template header for menu import (one row per item). */
export const MENU_CSV_HEADER = [
  'category',
  'name',
  'description',
  'price_naira',
  'available',
] as const;

/** PUT /v1/vendor-applications/me/test-order — walkthrough checklist; every item must be ticked. */
export const TestOrderChecklistSchema = z.strictObject({
  acceptedTestOrder: z.literal(true),
  markedItemUnavailable: z.literal(true),
  markedOrderReady: z.literal(true),
  reviewedPayoutSchedule: z.literal(true),
});
/** Test order checklist. */
export type TestOrderChecklist = z.infer<typeof TestOrderChecklistSchema>;

/** The vendor owner's own application. */
export const VendorApplicationSchema = z.strictObject({
  id: z.uuid().nullable(),
  status: ApplicationStatusSchema,
  vendorId: z.uuid().nullable(),
  currentStep: VendorStepSchema.nullable(),
  completedSteps: z.array(VendorStepSchema),
  businessDetails: VendorBusinessDetailsSchema.nullable(),
  documents: z
    .strictObject({
      cacNumber: z.string(),
      ownerIdType: OwnerIdTypeSchema,
      ownerIdLast4: z.string(),
    })
    .nullable(),
  location: z
    .strictObject({ branchId: z.uuid(), branchName: z.string(), addressLine: z.string() })
    .nullable(),
  menu: z
    .strictObject({
      draftMenuId: z.uuid().nullable(),
      items: z.number().int(),
      photoCount: z.number().int(),
    })
    .nullable(),
  bankAccount: BankAccountSummarySchema.nullable(),
  testOrderCompleted: z.boolean(),
  submittedAt: z.iso.datetime().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
});
/** Vendor application view. */
export type VendorApplication = z.infer<typeof VendorApplicationSchema>;

// ---------------------------------------------------------------- events

/** Payload of `onboarding.step.viewed` / `onboarding.step.completed` (PostHog funnel; no PII). */
export const OnboardingStepEventPayloadSchema = z.object({
  kind: OnboardingKindSchema,
  applicationId: z.uuid(),
  step: z.string(),
  analyticsEvent: z.enum(['onboarding_step_viewed', 'onboarding_step_completed']),
});
/** Onboarding step event payload. */
export type OnboardingStepEventPayload = z.infer<typeof OnboardingStepEventPayloadSchema>;

/** Payload of `onboarding.application.{submitted,approved,rejected}`. */
export const OnboardingApplicationEventPayloadSchema = z.object({
  kind: OnboardingKindSchema,
  applicationId: z.uuid(),
  userId: z.uuid(),
  vendorId: z.uuid().nullable(),
});
/** Onboarding application event payload. */
export type OnboardingApplicationEventPayload = z.infer<
  typeof OnboardingApplicationEventPayloadSchema
>;
