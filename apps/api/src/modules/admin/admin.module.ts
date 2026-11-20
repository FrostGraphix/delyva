import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ACCESS_TOKEN_VERIFIER, AuthGuard } from '../../shared/auth/auth.guard.js';
import { JoseAccessTokenVerifier } from '../../shared/auth/jose-access-token.verifier.js';
import { ENV, type Env } from '../../shared/config/env.js';
import { FIELD_ENCRYPTOR, type FieldEncryptor } from '../../shared/crypto/field-encryption.js';
import { DB, type Db } from '../../shared/database/database.js';
import { REDIS } from '../../shared/redis/redis.js';
import { IdentityModule } from '../identity/identity.module.js';
import { JoseAccessTokenSigner } from '../identity/infrastructure/jose-access-token.signer.js';
import { AdminTwoFactorGuard } from './api/admin-two-factor.guard.js';
import { AdminTwoFactorController, FeatureFlagsController } from './api/admin.controllers.js';
import { AdminTwoFactor } from './application/admin-two-factor.service.js';
import { AuditService } from './application/audit.service.js';
import { FeatureFlags } from './application/feature-flags.service.js';
import {
  DrizzleAuditRepository,
  DrizzleFeatureFlagRepository,
  DrizzleTotpFactorRepository,
  RedisTwoFactorSessions,
} from './infrastructure/drizzle-admin.repositories.js';

/**
 * Admin bounded context: immutable audit log, feature flags, admin TOTP 2FA (ADR 0700).
 * Exports `AuditService`, `FeatureFlags` and `AdminTwoFactorGuard` (+ its service) for other
 * modules' admin routes.
 */
@Module({
  imports: [IdentityModule],
  controllers: [AdminTwoFactorController, FeatureFlagsController],
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
      provide: AuditService,
      inject: [DB],
      useFactory: (db: Db) => new AuditService(new DrizzleAuditRepository(db)),
    },
    {
      provide: FeatureFlags,
      inject: [DB, AuditService],
      useFactory: (db: Db, audit: AuditService) =>
        new FeatureFlags({ repo: new DrizzleFeatureFlagRepository(db), audit }),
    },
    {
      provide: AdminTwoFactor,
      inject: [DB, REDIS, FIELD_ENCRYPTOR, AuditService, ENV],
      useFactory: (db: Db, redis: Redis, cipher: FieldEncryptor, audit: AuditService, env: Env) =>
        new AdminTwoFactor({
          factors: new DrizzleTotpFactorRepository(db),
          sessions: new RedisTwoFactorSessions(redis),
          cipher,
          clock: { nowMs: () => Date.now(), randomBytes: (n) => randomBytes(n) },
          audit,
          issuer: env.TOTP_ISSUER,
          sessionTtlSeconds: env.ADMIN_2FA_SESSION_TTL_SECONDS,
        }),
    },
    AdminTwoFactorGuard,
  ],
  exports: [AuditService, FeatureFlags, AdminTwoFactor, AdminTwoFactorGuard],
})
export class AdminModule {}
