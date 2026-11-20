import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ACCESS_TOKEN_VERIFIER, AuthGuard } from '../../shared/auth/auth.guard.js';
import { JoseAccessTokenVerifier } from '../../shared/auth/jose-access-token.verifier.js';
import { ENV, type Env } from '../../shared/config/env.js';
import { FIELD_ENCRYPTOR, type FieldEncryptor } from '../../shared/crypto/field-encryption.js';
import { DB, type Db } from '../../shared/database/database.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../shared/storage/storage.js';
import { AdminModule } from '../admin/admin.module.js';
import { AuditService } from '../admin/application/audit.service.js';
import { FeatureFlags } from '../admin/application/feature-flags.service.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { ApproveVendor } from '../catalog/application/approve-vendor.use-case.js';
import { VendorOnboardingService } from '../catalog/application/vendor-onboarding.service.js';
import { IdentityModule } from '../identity/identity.module.js';
import { RoleGrantService } from '../identity/application/role-grant.service.js';
import { JoseAccessTokenSigner } from '../identity/infrastructure/jose-access-token.signer.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PaymentsService } from '../payments/application/payments.service.js';
import { AdminReviewController } from './api/admin-review.controller.js';
import {
  RiderApplicationsController,
  UploadsController,
  VendorApplicationsController,
} from './api/onboarding.controllers.js';
import { ApplicationReview } from './application/application-review.js';
import type { Clock, KycProvider, OnboardingDeps, VendorCatalog } from './application/ports.js';
import { RiderOnboarding } from './application/rider-onboarding.js';
import { UploadService } from './application/uploads.js';
import { VendorOnboarding } from './application/vendor-onboarding.js';
import {
  DrizzleRiderApplicationRepository,
  DrizzleUploadRepository,
  DrizzleVendorApplicationRepository,
} from './infrastructure/drizzle-onboarding.repositories.js';
import { FakeKycProvider, SmileIdKycProviderStub } from './infrastructure/kyc.providers.js';

const clock: Clock = { now: () => new Date(), uuid: () => randomUUID() };
const KYC = Symbol('KYC_PROVIDER');
const CATALOG = Symbol('ONBOARDING_CATALOG');
const DEPS = Symbol('ONBOARDING_DEPS');

function catalogPort(svc: VendorOnboardingService, approve: ApproveVendor): VendorCatalog {
  return {
    createDraftVendor: (o, p) => svc.createDraftVendor(o, p),
    updateDraftVendor: (v, p) => svc.updateDraftVendor(v, p),
    setLocation: (v, i) => svc.setLocation(v, i),
    replaceDraftMenu: (v, prev, m) => svc.replaceDraftMenu(v, prev, m),
    activateDraftMenu: (v, m) => svc.activateDraftMenu(v, m),
    status: (v) => svc.status(v),
    submitForReview: (v) => svc.submitForReview(v),
    returnToDraft: (v) => svc.returnToDraft(v),
    goLive: async (v) => {
      await approve.execute(v);
    },
  };
}

/** Onboarding context: rider/vendor applications, KYC, private uploads, ops review (ADR 0700). */
@Module({
  imports: [IdentityModule, CatalogModule, PaymentsModule, AdminModule],
  controllers: [
    RiderApplicationsController,
    VendorApplicationsController,
    UploadsController,
    AdminReviewController,
  ],
  providers: [
    {
      provide: ACCESS_TOKEN_VERIFIER,
      inject: [JoseAccessTokenSigner, ENV],
      useFactory: (signer: JoseAccessTokenSigner, env: Env) =>
        new JoseAccessTokenVerifier({
          key: signer.verificationKey,
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        }),
    },
    AuthGuard,
    {
      provide: KYC,
      inject: [ENV],
      useFactory: (env: Env): KycProvider =>
        env.KYC_PROVIDER === 'fake' ? new FakeKycProvider() : new SmileIdKycProviderStub(),
    },
    { provide: CATALOG, inject: [VendorOnboardingService, ApproveVendor], useFactory: catalogPort },
    {
      provide: DEPS,
      inject: [FIELD_ENCRYPTOR, FeatureFlags],
      useFactory: (cipher: FieldEncryptor, flags: FeatureFlags): OnboardingDeps => ({
        clock,
        cipher,
        flags,
      }),
    },
    {
      provide: DrizzleRiderApplicationRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleRiderApplicationRepository(db),
    },
    {
      provide: DrizzleVendorApplicationRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleVendorApplicationRepository(db),
    },
    {
      provide: UploadService,
      inject: [STORAGE_PROVIDER, DB, AuditService],
      useFactory: (storage: StorageProvider, db: Db, audit: AuditService) =>
        new UploadService({ storage, uploads: new DrizzleUploadRepository(db), clock, audit }),
    },
    {
      provide: RiderOnboarding,
      inject: [DEPS, DrizzleRiderApplicationRepository, UploadService, KYC, PaymentsService],
      useFactory: (
        d: OnboardingDeps,
        repo: DrizzleRiderApplicationRepository,
        uploads: UploadService,
        kyc: KycProvider,
        bank: PaymentsService,
      ) => new RiderOnboarding({ ...d, repo, uploads, kyc, bank }),
    },
    {
      provide: VendorOnboarding,
      inject: [DEPS, DrizzleVendorApplicationRepository, UploadService, PaymentsService, CATALOG],
      useFactory: (
        d: OnboardingDeps,
        repo: DrizzleVendorApplicationRepository,
        uploads: UploadService,
        bank: PaymentsService,
        catalog: VendorCatalog,
      ) => new VendorOnboarding({ ...d, repo, uploads, bank, catalog }),
    },
    {
      provide: ApplicationReview,
      inject: [
        DrizzleRiderApplicationRepository,
        DrizzleVendorApplicationRepository,
        CATALOG,
        RoleGrantService,
        AuditService,
      ],
      useFactory: (
        riders: DrizzleRiderApplicationRepository,
        vendors: DrizzleVendorApplicationRepository,
        catalog: VendorCatalog,
        roles: RoleGrantService,
        audit: AuditService,
      ) => new ApplicationReview({ riders, vendors, catalog, roles, audit, now: () => new Date() }),
    },
  ],
})
export class OnboardingModule {}
