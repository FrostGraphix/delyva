import type {
  AdminRiderApplication,
  AdminVendorApplication,
  RiderApplication,
  VendorApplication,
} from '@delyva/contracts';
import { assertReviewable, type StoredStatus } from '../domain/application-steps.js';
import { OnboardingError } from '../domain/onboarding-errors.js';
import {
  type ApplicationRepository,
  ONBOARDING_EVENTS,
  type ReviewActor,
  type ReviewDeps,
  type RiderRecord,
  type VendorCatalog,
  type VendorRecord,
} from './ports.js';
import { riderView } from './rider-onboarding.js';
import { vendorView } from './vendor-onboarding.js';

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;
type Decision = 'approved' | 'rejected';

/** Ops review queue for both application kinds. Decisions need a reason and are audited. */
export class ApplicationReview {
  /** @param deps collaborators */
  constructor(
    private readonly deps: ReviewDeps & {
      riders: ApplicationRepository<RiderRecord>;
      vendors: ApplicationRepository<VendorRecord>;
      catalog: Pick<VendorCatalog, 'status' | 'goLive' | 'activateDraftMenu' | 'returnToDraft'>;
      now: () => Date;
    },
  ) {}

  /** Rider applications by status (masked). */
  async listRiders(status: StoredStatus): Promise<AdminRiderApplication[]> {
    return (await this.deps.riders.listByStatus(status)).map((r) => ({
      id: r.id,
      userId: r.userId,
      status: r.status,
      fullName: r.personal ? `${r.personal.firstName} ${r.personal.lastName}` : null,
      vehicleType: r.vehicle?.vehicleType ?? null,
      kycStatus: r.identity?.kycStatus ?? 'not_started',
      bankNameMatch: r.bank?.nameMatch ?? null,
      quizScorePercent: r.quiz?.scorePercent ?? null,
      documentUploadIds: [
        r.identity?.selfieUploadId,
        r.vehicle?.licenceUploadId,
        r.vehicle?.vehiclePhotoUploadId,
      ].filter((x): x is string => typeof x === 'string'),
      submittedAt: iso(r.submittedAt),
      reviewedAt: iso(r.reviewedAt),
      rejectionReason: r.rejectionReason,
    }));
  }

  /** Vendor applications by status. */
  async listVendors(status: StoredStatus): Promise<AdminVendorApplication[]> {
    return (await this.deps.vendors.listByStatus(status)).map((r) => ({
      id: r.id,
      userId: r.userId,
      vendorId: r.vendorId,
      status: r.status,
      businessName: r.business?.businessName ?? null,
      cacNumber: r.documents?.cacNumber ?? null,
      bankNameMatch: r.bank?.nameMatch ?? null,
      draftMenuId: r.draftMenuId,
      menuItems: r.menu?.items ?? 0,
      documentUploadIds: [
        r.documents?.cacCertificateUploadId,
        r.documents?.ownerIdUploadId,
        r.menu?.csvUploadId,
        ...(r.menu?.photoUploadIds ?? []),
      ].filter((x): x is string => typeof x === 'string'),
      submittedAt: iso(r.submittedAt),
      reviewedAt: iso(r.reviewedAt),
      rejectionReason: r.rejectionReason,
    }));
  }

  /** Approve → grant `rider` role (identity), status approved, audit in the same tx. */
  async decideRider(
    actor: ReviewActor,
    id: string,
    decision: Decision,
    reason: string,
  ): Promise<RiderApplication> {
    const r = await this.deps.riders.findById(id);
    if (!r) throw new OnboardingError('not_found', 'Application not found.');
    assertReviewable(r.status);
    // Role grant first: idempotent, so a retry after a later failure is safe.
    if (decision === 'approved') await this.deps.roles.grant(r.userId, 'rider');
    const next: RiderRecord = this.decided(r, actor, decision, reason);
    await this.save(this.deps.riders, next, r, actor, 'rider', reason, null);
    return riderView(next);
  }

  /** Approve → activate draft menu, catalog go-live, grant `vendor_owner`; reject → catalog back to draft. */
  async decideVendor(
    actor: ReviewActor,
    id: string,
    decision: Decision,
    reason: string,
  ): Promise<VendorApplication> {
    const r = await this.deps.vendors.findById(id);
    if (!r) throw new OnboardingError('not_found', 'Application not found.');
    assertReviewable(r.status);
    if (!r.vendorId) throw new OnboardingError('conflict', 'Application has no catalog vendor.');
    if (decision === 'approved') {
      if (r.draftMenuId) await this.deps.catalog.activateDraftMenu(r.vendorId, r.draftMenuId);
      if ((await this.deps.catalog.status(r.vendorId)) !== 'live')
        await this.deps.catalog.goLive(r.vendorId);
      await this.deps.roles.grant(r.userId, 'vendor_owner');
    } else {
      await this.deps.catalog.returnToDraft(r.vendorId);
    }
    const next: VendorRecord = this.decided(r, actor, decision, reason);
    await this.save(this.deps.vendors, next, r, actor, 'vendor', reason, r.vendorId);
    return vendorView(next);
  }

  private decided<R extends RiderRecord | VendorRecord>(
    r: R,
    actor: ReviewActor,
    decision: Decision,
    reason: string,
  ): R {
    return {
      ...r,
      status: decision,
      reviewedAt: this.deps.now(),
      reviewedBy: actor.userId,
      rejectionReason: decision === 'rejected' ? reason : null,
    };
  }

  private async save<R extends RiderRecord | VendorRecord>(
    repo: ApplicationRepository<R>,
    next: R,
    before: R,
    actor: ReviewActor,
    kind: 'rider' | 'vendor',
    reason: string,
    vendorId: string | null,
  ): Promise<void> {
    const decision = next.status as Decision;
    const event = decision === 'approved' ? ONBOARDING_EVENTS.approved : ONBOARDING_EVENTS.rejected;
    const ok = await repo.save(
      next,
      [{ type: event, payload: { kind, applicationId: next.id, userId: next.userId, vendorId } }],
      async (tx) => {
        await this.deps.audit.record(
          {
            actorId: actor.userId,
            actorRoles: actor.roles,
            action: `${kind}_application.${decision}`,
            targetType: `${kind}_application`,
            targetId: next.id,
            reason,
            before: { status: before.status },
            after: {
              status: next.status,
              grantedRole:
                decision === 'approved' ? (kind === 'rider' ? 'rider' : 'vendor_owner') : null,
            },
            ip: actor.ip,
          },
          tx,
        );
      },
    );
    if (!ok) throw new OnboardingError('conflict', 'The application changed concurrently; retry.');
  }
}
