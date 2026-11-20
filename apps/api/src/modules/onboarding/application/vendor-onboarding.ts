import {
  type BankAccountInput,
  type MenuImportResult,
  type MenuPhotos,
  type TestOrderChecklist,
  type VendorApplication,
  type VendorBusinessDetails,
  type VendorDocuments,
  type VendorLocation,
  VENDOR_STEPS,
  type VendorStep,
} from '@delyva/contracts';
import { AppError } from '../../../shared/errors/app-error.js';
import {
  assertCanSaveStep,
  assertSubmittable,
  currentStep,
  statusAfterEdit,
  withCompleted,
} from '../domain/application-steps.js';
import { businessNameMatches, last4 } from '../domain/bank-name.js';
import { parseMenuCsv } from '../domain/menu-csv.js';
import { OnboardingError } from '../domain/onboarding-errors.js';
import { bankView, resolveBank } from './bank-account.js';
import {
  type ApplicationRepository,
  type BankResolver,
  ONBOARDING_EVENTS,
  type OnboardingDeps,
  type PendingEvent,
  stepEvent,
  type VendorCatalog,
  type VendorRecord,
} from './ports.js';
import type { UploadService } from './uploads.js';

const FLAG = 'onboarding.vendor_applications';
const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

/** Vendor-facing view (masked PII). */
export function vendorView(r: VendorRecord | null): VendorApplication {
  if (!r) {
    return {
      id: null,
      status: 'not_started',
      vendorId: null,
      currentStep: 'business_details',
      completedSteps: [],
      businessDetails: null,
      documents: null,
      location: null,
      menu: null,
      bankAccount: null,
      testOrderCompleted: false,
      submittedAt: null,
      reviewedAt: null,
      rejectionReason: null,
    };
  }
  return {
    id: r.id,
    status: r.status,
    vendorId: r.vendorId,
    currentStep: currentStep(VENDOR_STEPS, r.completedSteps),
    completedSteps: r.completedSteps,
    businessDetails: r.business,
    documents: r.documents
      ? {
          cacNumber: r.documents.cacNumber,
          ownerIdType: r.documents.ownerIdType,
          ownerIdLast4: r.documents.ownerIdLast4,
        }
      : null,
    location:
      r.location && r.branchId
        ? {
            branchId: r.branchId,
            branchName: r.location.branchName,
            addressLine: r.location.addressLine,
          }
        : null,
    menu: r.menu
      ? {
          draftMenuId: r.draftMenuId,
          items: r.menu.items,
          photoCount: r.menu.photoUploadIds.length,
        }
      : null,
    bankAccount: bankView(r.bank),
    testOrderCompleted: r.testOrder !== null,
    submittedAt: iso(r.submittedAt),
    reviewedAt: iso(r.reviewedAt),
    rejectionReason: r.rejectionReason,
  };
}

/**
 * Vendor onboarding (CLAUDE.md → Onboarding → Vendor). Writes the catalog vendor (draft →
 * in_review) through catalog's public services; nothing catalog-owned is duplicated here.
 */
export class VendorOnboarding {
  /** @param deps collaborators */
  constructor(
    private readonly deps: OnboardingDeps & {
      repo: ApplicationRepository<VendorRecord>;
      uploads: UploadService;
      bank: BankResolver;
      catalog: VendorCatalog;
    },
  ) {}

  /** The caller's application. */
  async get(userId: string): Promise<VendorApplication> {
    return vendorView(await this.deps.repo.findByUser(userId));
  }

  /** Funnel analytics. */
  async recordView(userId: string, step: string): Promise<void> {
    if (!(VENDOR_STEPS as readonly string[]).includes(step))
      throw new OnboardingError('validation_failed', 'Unknown vendor step.');
    const r = await this.ensure(userId);
    await this.deps.repo.appendEvents([stepEvent('vendor', r.id, step, true)]);
  }

  /** Step 1: creates (or edits) the draft catalog vendor owned by the caller. */
  async saveBusinessDetails(
    userId: string,
    body: VendorBusinessDetails,
  ): Promise<VendorApplication> {
    const r = await this.ensure(userId);
    assertCanSaveStep(VENDOR_STEPS, r, 'business_details');
    const profile = {
      name: body.businessName,
      category: body.category,
      description: body.description ?? null,
    };
    let vendorId = r.vendorId;
    if (vendorId) await this.deps.catalog.updateDraftVendor(vendorId, profile);
    else vendorId = await this.deps.catalog.createDraftVendor(userId, profile);
    const id = vendorId;
    return this.step(userId, 'business_details', (x) => ({ ...x, vendorId: id, business: body }));
  }

  /** Step 2: CAC certificate + owner ID (ID number encrypted at rest). */
  async saveDocuments(userId: string, body: VendorDocuments): Promise<VendorApplication> {
    await this.deps.uploads.requireUploaded(userId, body.cacCertificateUploadId, [
      'cac_certificate',
    ]);
    await this.deps.uploads.requireUploaded(userId, body.ownerIdUploadId, ['owner_id']);
    return this.step(userId, 'documents', (r) => ({
      ...r,
      documents: {
        cacNumber: body.cacNumber.toUpperCase(),
        cacCertificateUploadId: body.cacCertificateUploadId,
        ownerIdType: body.ownerIdType,
        ownerIdUploadId: body.ownerIdUploadId,
        ownerIdLast4: last4(body.ownerIdNumber),
        ownerIdCiphertext: this.deps.cipher.encrypt(
          body.ownerIdNumber,
          `vendor_applications.owner_id:${r.id}`,
        ),
      },
    }));
  }

  /** Step 3: branch pin (zone via geo) and opening hours, stored in catalog. */
  async saveLocation(userId: string, body: VendorLocation): Promise<VendorApplication> {
    const r = await this.editable(userId, 'location');
    const { branchId } = await this.deps.catalog.setLocation(this.vendorIdOf(r), {
      branchId: r.branchId,
      name: body.branchName,
      location: { lat: body.lat, lng: body.lng },
      prepMinutes: body.prepMinutes,
      hours: body.openingHours,
    });
    return this.step(userId, 'location', (x) => ({ ...x, branchId, location: { ...body } }));
  }

  /** Step 4a: CSV → draft (inactive) catalog menu. Bad rows are reported with line numbers. */
  async importMenu(userId: string, csvUploadId: string): Promise<MenuImportResult> {
    const r = await this.editable(userId, 'menu');
    const file = await this.deps.uploads.read(userId, csvUploadId, ['menu_csv']);
    const { menu, errors } = parseMenuCsv(file.bytes.toString('utf8'));
    if (errors.length > 0) {
      throw new AppError(
        'validation_failed',
        `The menu file has ${String(errors.length)} problem(s).`,
        errors.map((e) => ({ path: `line ${String(e.line)}`, message: e.message })),
      );
    }
    const draftMenuId = await this.deps.catalog.replaceDraftMenu(
      this.vendorIdOf(r),
      r.draftMenuId,
      menu,
    );
    const items = menu.categories.reduce((n, c) => n + c.items.length, 0);
    await this.step(userId, 'menu', (x) => ({
      ...x,
      draftMenuId,
      menu: {
        categories: menu.categories.length,
        items,
        csvUploadId,
        photoUploadIds: x.menu?.photoUploadIds ?? [],
      },
    }));
    return { draftMenuId, categories: menu.categories.length, items };
  }

  /** Step 4b: photo-of-menu files kept for ops to transcribe. */
  async saveMenuPhotos(userId: string, body: MenuPhotos): Promise<VendorApplication> {
    for (const id of body.uploadIds)
      await this.deps.uploads.requireUploaded(userId, id, ['menu_photo']);
    return this.step(userId, 'menu', (r) => ({
      ...r,
      menu: {
        categories: r.menu?.categories ?? 0,
        items: r.menu?.items ?? 0,
        csvUploadId: r.menu?.csvUploadId ?? null,
        photoUploadIds: body.uploadIds,
      },
    }));
  }

  /** Step 5: payout account resolved by name. */
  async saveBankAccount(userId: string, body: BankAccountInput): Promise<VendorApplication> {
    const r = await this.editable(userId, 'bank_account');
    const name = r.business?.businessName ?? '';
    const bank = await resolveBank(
      body,
      this.deps.bank,
      this.deps.cipher,
      `vendor_applications.bank_account:${r.id}`,
      (accountName) => businessNameMatches(name, accountName),
    );
    return this.step(userId, 'bank_account', (x) => ({ ...x, bank }));
  }

  /** Step 6: test-order walkthrough checklist. */
  saveTestOrder(userId: string, body: TestOrderChecklist): Promise<VendorApplication> {
    return this.step(userId, 'test_order', (r) => ({ ...r, testOrder: body }));
  }

  /** Submit: catalog vendor draft → in_review. */
  async submit(userId: string): Promise<VendorApplication> {
    const r = await this.deps.repo.findByUser(userId);
    if (!r) throw new OnboardingError('conflict', 'Start your application first.');
    assertSubmittable(VENDOR_STEPS, r);
    const vendorId = this.vendorIdOf(r);
    await this.deps.catalog.submitForReview(vendorId);
    await this.persist(
      { ...r, status: 'pending_review', submittedAt: this.deps.clock.now(), rejectionReason: null },
      [
        {
          type: ONBOARDING_EVENTS.submitted,
          payload: { kind: 'vendor', applicationId: r.id, userId, vendorId },
        },
      ],
    );
    return this.get(userId);
  }

  private vendorIdOf(r: VendorRecord): string {
    if (!r.vendorId)
      throw new OnboardingError('conflict', 'Complete the business_details step first.');
    return r.vendorId;
  }

  private async editable(userId: string, step: VendorStep): Promise<VendorRecord> {
    const r = await this.ensure(userId);
    assertCanSaveStep(VENDOR_STEPS, r, step);
    return r;
  }

  private async step(
    userId: string,
    step: VendorStep,
    apply: (r: VendorRecord) => VendorRecord,
  ): Promise<VendorApplication> {
    const r = await this.editable(userId, step);
    await this.persist(
      {
        ...apply(r),
        status: statusAfterEdit(r.status),
        completedSteps: withCompleted(VENDOR_STEPS, r.completedSteps, step),
      },
      [stepEvent('vendor', r.id, step, false)],
    );
    return this.get(userId);
  }

  private async persist(r: VendorRecord, events: readonly PendingEvent[]): Promise<void> {
    if (!(await this.deps.repo.save(r, events))) {
      throw new OnboardingError('conflict', 'The application changed concurrently; retry.');
    }
  }

  private async ensure(userId: string): Promise<VendorRecord> {
    const existing = await this.deps.repo.findByUser(userId);
    if (existing) return existing;
    if (!(await this.deps.flags.isEnabled(FLAG, true))) {
      throw new OnboardingError('forbidden', 'Vendor applications are paused right now.');
    }
    return this.deps.repo.create({
      id: this.deps.clock.uuid(),
      userId,
      vendorId: null,
      branchId: null,
      draftMenuId: null,
      status: 'in_progress',
      completedSteps: [],
      version: 0,
      business: null,
      documents: null,
      location: null,
      menu: null,
      bank: null,
      testOrder: null,
      submittedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    });
  }
}
