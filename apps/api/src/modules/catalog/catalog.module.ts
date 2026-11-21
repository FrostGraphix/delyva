import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ACCESS_TOKEN_VERIFIER, AuthGuard } from '../../shared/auth/auth.guard.js';
import { JoseAccessTokenVerifier } from '../../shared/auth/jose-access-token.verifier.js';
import { OWNERSHIP_CHECKER } from '../../shared/auth/ownership.guard.js';
import { ENV, type Env } from '../../shared/config/env.js';
import { DB, type Db } from '../../shared/database/database.js';
import { GeoService } from '../geo/application/geo.service.js';
import { GeoModule } from '../geo/geo.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JoseAccessTokenSigner } from '../identity/infrastructure/jose-access-token.signer.js';
import { MyVendorsController } from './api/my-vendors.controller.js';
import { VendorApprovalsController } from './api/vendor-approvals.controller.js';
import { VendorMenuController } from './api/vendor-menu.controller.js';
import { VendorsController } from './api/vendors.controller.js';
import { ApproveVendor } from './application/approve-vendor.use-case.js';
import { CatalogService } from './application/catalog.service.js';
import { CreateMenuItem } from './application/create-menu-item.use-case.js';
import { CreateModifierGroup } from './application/create-modifier-group.use-case.js';
import { DiscoverVendors } from './application/discover-vendors.query.js';
import { GetVendor } from './application/get-vendor.query.js';
import { ListMyVendors } from './application/list-my-vendors.query.js';
import type { Clock } from './application/ports.js';
import { ReplaceOpeningHours } from './application/replace-opening-hours.use-case.js';
import { SetItemAvailability } from './application/set-item-availability.use-case.js';
import { SetOptionAvailability } from './application/set-option-availability.use-case.js';
import { UpdateMenuItem } from './application/update-menu-item.use-case.js';
import { VendorOnboardingService } from './application/vendor-onboarding.service.js';
import { DrizzleCatalogOnboardingRepository } from './infrastructure/drizzle-catalog-onboarding.repository.js';
import { DrizzleCatalogReadRepository } from './infrastructure/drizzle-catalog-read.repository.js';
import { DrizzleCatalogWriteRepository } from './infrastructure/drizzle-catalog-write.repository.js';
import { DrizzleMyVendorsReader } from './infrastructure/drizzle-my-vendors.reader.js';
import { VendorOwnershipChecker } from './infrastructure/vendor-ownership.checker.js';

const clock: Clock = { now: () => new Date(), uuid: () => randomUUID() };
type R = DrizzleCatalogReadRepository;
type W = DrizzleCatalogWriteRepository;

/** Catalog bounded context: vendors, branches, hours, menus, items, modifiers, availability. */
@Module({
  imports: [IdentityModule, GeoModule],
  controllers: [MyVendorsController, VendorsController, VendorMenuController, VendorApprovalsController],
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
      provide: DrizzleCatalogReadRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleCatalogReadRepository(db),
    },
    {
      provide: DrizzleCatalogWriteRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleCatalogWriteRepository(db),
    },
    {
      provide: OWNERSHIP_CHECKER,
      inject: [DrizzleCatalogWriteRepository],
      useFactory: (w: W) => new VendorOwnershipChecker(w),
    },
    {
      provide: DiscoverVendors,
      inject: [DrizzleCatalogReadRepository, GeoService],
      useFactory: (catalog: R, geo: GeoService) => new DiscoverVendors({ catalog, geo, clock }),
    },
    {
      provide: GetVendor,
      inject: [DrizzleCatalogReadRepository],
      useFactory: (catalog: R) => new GetVendor({ catalog, clock }),
    },
    {
      provide: ListMyVendors,
      inject: [DB],
      useFactory: (db: Db) => new ListMyVendors(new DrizzleMyVendorsReader(db)),
    },
    {
      provide: CreateMenuItem,
      inject: [DrizzleCatalogWriteRepository],
      useFactory: (catalog: W) => new CreateMenuItem({ catalog, clock }),
    },
    {
      provide: UpdateMenuItem,
      inject: [DrizzleCatalogWriteRepository],
      useFactory: (w: W) => new UpdateMenuItem(w),
    },
    {
      provide: SetItemAvailability,
      inject: [DrizzleCatalogWriteRepository],
      useFactory: (w: W) => new SetItemAvailability(w),
    },
    {
      provide: SetOptionAvailability,
      inject: [DrizzleCatalogWriteRepository],
      useFactory: (w: W) => new SetOptionAvailability(w),
    },
    {
      provide: CreateModifierGroup,
      inject: [DrizzleCatalogWriteRepository],
      useFactory: (catalog: W) => new CreateModifierGroup({ catalog, clock }),
    },
    {
      provide: ReplaceOpeningHours,
      inject: [DrizzleCatalogWriteRepository],
      useFactory: (w: W) => new ReplaceOpeningHours(w),
    },
    {
      provide: ApproveVendor,
      inject: [DrizzleCatalogReadRepository, DrizzleCatalogWriteRepository],
      useFactory: (reads: R, writes: W) => new ApproveVendor({ reads, writes, clock }),
    },
    { provide: CatalogService, inject: [DB], useFactory: buildCatalogService },
    {
      provide: VendorOnboardingService,
      inject: [DB, DrizzleCatalogWriteRepository, GeoService],
      useFactory: (db: Db, writes: W, geo: GeoService) =>
        new VendorOnboardingService({
          onboarding: new DrizzleCatalogOnboardingRepository(db),
          writes,
          geo,
          clock,
        }),
    },
  ],
  // Public interface for the onboarding context (ADR 0700).
  exports: [VendorOnboardingService, ApproveVendor, CatalogService],
})
export class CatalogModule {}

/**
 * Builds the public {@link CatalogService} on a database handle. Exposed for the composition
 * root (the realtime order-room authorizer is wired outside this module's injector).
 */
export function buildCatalogService(db: Db): CatalogService {
  const writes = new DrizzleCatalogWriteRepository(db);
  return new CatalogService({
    reads: new DrizzleCatalogReadRepository(db),
    members: writes,
    clock,
  });
}
