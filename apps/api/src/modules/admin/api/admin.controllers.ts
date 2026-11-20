import { Body, Controller, Get, HttpCode, Post, Put, Req, UseGuards } from '@nestjs/common';
import {
  type AdminTwoFactorSession,
  type FeatureFlag,
  type FeatureFlagList,
  type TotpCode,
  TotpCodeSchema,
  type TotpEnrolment,
  type UpsertFeatureFlag,
  UpsertFeatureFlagSchema,
} from '@delyva/contracts';
import type { Request } from 'express';
import {
  type AuthPrincipal,
  AuthGuard,
  Principal,
  Roles,
} from '../../../shared/auth/auth.guard.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { AdminTwoFactor } from '../application/admin-two-factor.service.js';
import { FeatureFlags } from '../application/feature-flags.service.js';
import { AdminTwoFactorGuard, clientIp } from './admin-two-factor.guard.js';

/** TOTP enrolment and verification for admin roles (bearer auth only; no 2FA session yet). */
@Controller('v1/admin/2fa')
@UseGuards(AuthGuard)
@Roles('support', 'ops', 'finance', 'super_admin')
export class AdminTwoFactorController {
  /** @param twoFactor service */
  constructor(private readonly twoFactor: AdminTwoFactor) {}

  /** POST /v1/admin/2fa/enrolment */
  @Post('enrolment')
  @Idempotent()
  enrol(@Principal() p: AuthPrincipal): Promise<TotpEnrolment> {
    return this.twoFactor.enrol(p.userId);
  }

  /** POST /v1/admin/2fa/enrolment/confirm */
  @Post('enrolment/confirm')
  @HttpCode(200)
  confirm(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(TotpCodeSchema)) body: TotpCode,
  ): Promise<AdminTwoFactorSession> {
    return this.twoFactor.confirm(p.userId, body.code, p.roles);
  }

  /** POST /v1/admin/2fa/verify */
  @Post('verify')
  @HttpCode(200)
  verify(
    @Principal() p: AuthPrincipal,
    @Body(new ZodBodyPipe(TotpCodeSchema)) body: TotpCode,
  ): Promise<AdminTwoFactorSession> {
    return this.twoFactor.verify(p.userId, body.code);
  }
}

/** Feature flags (super_admin, 2FA). */
@Controller('v1/admin/feature-flags')
@UseGuards(AuthGuard, AdminTwoFactorGuard)
@Roles('super_admin')
export class FeatureFlagsController {
  /** @param flags service */
  constructor(private readonly flags: FeatureFlags) {}

  /** GET /v1/admin/feature-flags */
  @Get()
  async list(): Promise<FeatureFlagList> {
    return { items: await this.flags.list() };
  }

  /** PUT /v1/admin/feature-flags (upsert by key; naturally idempotent; audited) */
  @Put()
  upsert(
    @Principal() p: AuthPrincipal,
    @Req() req: Request,
    @Body(new ZodBodyPipe(UpsertFeatureFlagSchema)) body: UpsertFeatureFlag,
  ): Promise<FeatureFlag> {
    return this.flags.upsert({ userId: p.userId, roles: p.roles, ip: clientIp(req) }, body);
  }
}
