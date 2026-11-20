import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ACCESS_TOKEN_VERIFIER, AuthGuard } from '../../shared/auth/auth.guard.js';
import { JoseAccessTokenVerifier } from '../../shared/auth/jose-access-token.verifier.js';
import { ENV, type Env } from '../../shared/config/env.js';
import { DB, type Db } from '../../shared/database/database.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JoseAccessTokenSigner } from '../identity/infrastructure/jose-access-token.signer.js';
import { PricingAdminController } from './api/pricing-admin.controller.js';
import { QuotesController } from './api/quotes.controller.js';
import type { Clock } from './application/ports.js';
import { PricingAdmin } from './application/pricing-admin.js';
import { PricingService } from './application/pricing.service.js';
import { RedeemPromo } from './application/redeem-promo.use-case.js';
import {
  DrizzleFeeRuleRepository,
  DrizzlePromoRepository,
  DrizzleSurgeRuleRepository,
} from './infrastructure/drizzle-pricing.repositories.js';
import {
  DrizzlePromoRedemptionUnitOfWork,
  DrizzlePromoUsageReader,
} from './infrastructure/drizzle-promo-redemption.js';
import { TransactionalRedeemPromo } from './infrastructure/transactional-redeem-promo.js';

const CLOCK = Symbol('PRICING_CLOCK');
const systemClock: Clock = { now: () => new Date(), uuid: () => randomUUID() };

/**
 * Pricing bounded context: quotes (fees, surge, promos, VAT) and promo redemption.
 * Exports {@link PricingService} and {@link RedeemPromo} for the ordering module.
 */
@Module({
  imports: [IdentityModule],
  controllers: [QuotesController, PricingAdminController],
  providers: [
    { provide: CLOCK, useValue: systemClock },
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
      provide: DrizzleFeeRuleRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleFeeRuleRepository(db),
    },
    {
      provide: DrizzleSurgeRuleRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzleSurgeRuleRepository(db),
    },
    {
      provide: DrizzlePromoRepository,
      inject: [DB],
      useFactory: (db: Db) => new DrizzlePromoRepository(db),
    },
    {
      provide: DrizzlePromoUsageReader,
      inject: [DB],
      useFactory: (db: Db) => new DrizzlePromoUsageReader(db),
    },
    {
      provide: DrizzlePromoRedemptionUnitOfWork,
      inject: [DB],
      useFactory: (db: Db) => new DrizzlePromoRedemptionUnitOfWork(db),
    },
    {
      provide: PricingService,
      inject: [
        DrizzleFeeRuleRepository,
        DrizzleSurgeRuleRepository,
        DrizzlePromoRepository,
        DrizzlePromoUsageReader,
        CLOCK,
      ],
      useFactory: (
        feeRules: DrizzleFeeRuleRepository,
        surgeRules: DrizzleSurgeRuleRepository,
        promos: DrizzlePromoRepository,
        usage: DrizzlePromoUsageReader,
        clock: Clock,
      ) => new PricingService({ feeRules, surgeRules, promos, usage, clock }),
    },
    {
      provide: RedeemPromo,
      inject: [DrizzlePromoRedemptionUnitOfWork, CLOCK],
      useFactory: (uow: DrizzlePromoRedemptionUnitOfWork, clock: Clock) =>
        new RedeemPromo({ uow, clock }),
    },
    {
      provide: TransactionalRedeemPromo,
      inject: [CLOCK],
      useFactory: (clock: Clock) => new TransactionalRedeemPromo(clock),
    },
    {
      provide: PricingAdmin,
      inject: [DrizzleFeeRuleRepository, DrizzleSurgeRuleRepository, DrizzlePromoRepository, CLOCK],
      useFactory: (
        feeRules: DrizzleFeeRuleRepository,
        surgeRules: DrizzleSurgeRuleRepository,
        promos: DrizzlePromoRepository,
        clock: Clock,
      ) => new PricingAdmin({ feeRules, surgeRules, promos, clock }),
    },
  ],
  exports: [PricingService, RedeemPromo, TransactionalRedeemPromo],
})
export class PricingModule {}
