import type {
  OnboardingKind,
  RiderPersonalDetails,
  RiderStep,
  RiderVehicle,
  TestOrderChecklist,
  UploadPurpose,
  VendorBusinessDetails,
  VendorStep,
  OpeningHoursEntry,
  Role,
} from '@delyva/contracts';
import type { AuditEntry } from '../../admin/application/ports.js';
import type { DraftMenu } from '../../catalog/application/vendor-onboarding.service.js';
import type { StoredStatus } from '../domain/application-steps.js';

/** Clock and ids. */
export interface Clock {
  /** Now. */
  now(): Date;
  /** UUID v4. */
  uuid(): string;
}

/** Masked bank account plus its ciphertext. */
export interface StoredBank {
  readonly bankCode: string;
  readonly accountNumberCiphertext: string;
  readonly last4: string;
  readonly accountName: string;
  readonly nameMatch: boolean;
}

/** Review bookkeeping common to both application kinds. */
export interface ReviewFields {
  readonly submittedAt: Date | null;
  readonly reviewedAt: Date | null;
  readonly reviewedBy: string | null;
  readonly rejectionReason: string | null;
}

/** Rider application aggregate as persisted. */
export interface RiderRecord extends ReviewFields {
  readonly id: string;
  readonly userId: string;
  readonly status: StoredStatus;
  readonly completedSteps: RiderStep[];
  readonly version: number;
  readonly personal: RiderPersonalDetails | null;
  readonly identity: {
    ninCiphertext: string;
    ninLast4: string;
    selfieUploadId: string;
    kycStatus: 'verified' | 'failed' | 'manual_review';
    kycReference: string | null;
    kycFailureReason: string | null;
    kycAttempts: number;
  } | null;
  readonly vehicle: RiderVehicle | null;
  readonly guarantor: {
    fullName: string;
    relationship: string;
    phoneCiphertext: string;
    phoneLast4: string;
  } | null;
  readonly bank: StoredBank | null;
  readonly quiz: { attempts: number; scorePercent: number; passed: boolean } | null;
}

/** Vendor application aggregate as persisted. */
export interface VendorRecord extends ReviewFields {
  readonly id: string;
  readonly userId: string;
  readonly vendorId: string | null;
  readonly branchId: string | null;
  readonly draftMenuId: string | null;
  readonly status: StoredStatus;
  readonly completedSteps: VendorStep[];
  readonly version: number;
  readonly business: VendorBusinessDetails | null;
  readonly documents: {
    cacNumber: string;
    cacCertificateUploadId: string;
    ownerIdType: 'nin' | 'drivers_licence' | 'international_passport' | 'voters_card';
    ownerIdUploadId: string;
    ownerIdCiphertext: string;
    ownerIdLast4: string;
  } | null;
  readonly location: {
    branchName: string;
    addressLine: string;
    lat: number;
    lng: number;
    prepMinutes: number;
    openingHours: OpeningHoursEntry[];
  } | null;
  readonly menu: {
    categories: number;
    items: number;
    csvUploadId: string | null;
    photoUploadIds: string[];
  } | null;
  readonly bank: StoredBank | null;
  readonly testOrder: TestOrderChecklist | null;
}

/** Domain event appended to the outbox with a save. */
export interface PendingEvent {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

/** Hook run inside the save transaction (audit entries). */
export type InTx = (tx: unknown) => Promise<void>;

/** Persistence for one application kind with optimistic concurrency on `version`. */
export interface ApplicationRepository<R extends { id: string; version: number }> {
  /** By applicant. */
  findByUser(userId: string): Promise<R | null>;
  /** By id. */
  findById(id: string): Promise<R | null>;
  /** Inserts a new record; returns the existing one when the user already has one. */
  create(record: R): Promise<R>;
  /** Saves when `version` still matches (then bumps it); appends events and runs `inTx` atomically. */
  save(record: R, events: readonly PendingEvent[], inTx?: InTx): Promise<boolean>;
  /** Appends events only (funnel analytics). */
  appendEvents(events: readonly PendingEvent[]): Promise<void>;
  /** Records by status, oldest submission first. */
  listByStatus(status: StoredStatus): Promise<R[]>;
}

/** Declared upload. */
export interface UploadRecord {
  readonly id: string;
  readonly ownerUserId: string;
  readonly purpose: UploadPurpose;
  readonly contentType: string;
  readonly maxSizeBytes: number;
  readonly storageKey: string;
  readonly status: 'pending' | 'verified';
}

/** Upload persistence. */
export interface UploadRepository {
  /** Inserts. */
  create(u: UploadRecord): Promise<void>;
  /** By id. */
  find(id: string): Promise<UploadRecord | null>;
  /** Marks verified with the real size. */
  markVerified(id: string, sizeBytes: number): Promise<void>;
}

/** Outcome of a KYC check. */
export interface KycResult {
  readonly outcome: 'verified' | 'failed' | 'manual_review';
  readonly providerReference: string;
  readonly reason: string | null;
}

/** NIN + selfie liveness verification through a Nigerian KYC vendor. */
export interface KycProvider {
  /** Verifies the NIN matches the person and the selfie is live and matches the NIN photo. */
  verifyIdentity(input: {
    reference: string;
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    selfie: { contentType: string; bytes: Buffer };
  }): Promise<KycResult>;
}

/** Bank resolve (payments' public service). */
export interface BankResolver {
  /** Registered account name. */
  resolveBankAccount(i: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountNumber: string; accountName: string }>;
}

/** Catalog operations onboarding needs (catalog's public services). */
export interface VendorCatalog {
  /** New draft vendor. */
  createDraftVendor(
    ownerUserId: string,
    p: { name: string; category: VendorBusinessDetails['category']; description: string | null },
  ): Promise<string>;
  /** Edit while draft. */
  updateDraftVendor(
    vendorId: string,
    p: { name: string; category: VendorBusinessDetails['category']; description: string | null },
  ): Promise<void>;
  /** Branch pin + hours. */
  setLocation(
    vendorId: string,
    i: {
      branchId: string | null;
      name: string;
      location: { lat: number; lng: number };
      prepMinutes: number;
      hours: readonly OpeningHoursEntry[];
    },
  ): Promise<{ branchId: string }>;
  /** Draft menu. */
  replaceDraftMenu(vendorId: string, previous: string | null, menu: DraftMenu): Promise<string>;
  /** Activate reviewed menu. */
  activateDraftMenu(vendorId: string, menuId: string): Promise<void>;
  /** Status. */
  status(vendorId: string): Promise<string>;
  /** draft → in_review. */
  submitForReview(vendorId: string): Promise<void>;
  /** in_review → draft. */
  returnToDraft(vendorId: string): Promise<void>;
  /** Catalog go-live path (in_review → live). */
  goLive(vendorId: string): Promise<void>;
}

/** Collaborators shared by onboarding use cases. */
export interface OnboardingDeps {
  readonly clock: Clock;
  readonly cipher: { encrypt(p: string, c: string): string; decrypt(e: string, c: string): string };
  readonly flags: { isEnabled(key: string, fallback: boolean): Promise<boolean> };
}

/** Admin actor for review decisions. */
export interface ReviewActor {
  readonly userId: string;
  readonly roles: readonly string[];
  readonly ip: string | null;
}

/** Role grants (identity) and audit (admin). */
export interface ReviewDeps {
  readonly roles: { grant(userId: string, role: Role): Promise<unknown> };
  readonly audit: { record(e: AuditEntry, tx?: unknown): Promise<string> };
}

/** Onboarding event names. */
export const ONBOARDING_EVENTS = {
  stepViewed: 'onboarding.step.viewed',
  stepCompleted: 'onboarding.step.completed',
  submitted: 'onboarding.application.submitted',
  approved: 'onboarding.application.approved',
  rejected: 'onboarding.application.rejected',
} as const;

/** Builds a funnel step event (no PII). */
export function stepEvent(
  kind: OnboardingKind,
  applicationId: string,
  step: string,
  viewed: boolean,
): PendingEvent {
  return {
    type: viewed ? ONBOARDING_EVENTS.stepViewed : ONBOARDING_EVENTS.stepCompleted,
    payload: {
      kind,
      applicationId,
      step,
      analyticsEvent: viewed ? 'onboarding_step_viewed' : 'onboarding_step_completed',
    },
  };
}
