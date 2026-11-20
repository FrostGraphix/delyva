import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  type AdminRiderApplicationList,
  type AdminVendorApplicationList,
  type DownloadUrl,
  type ListApplicationsQuery,
  ListApplicationsQuerySchema,
  type ReviewDecision,
  ReviewDecisionSchema,
  type RiderApplication,
  type VendorApplication,
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
import { ZodQueryPipe } from '../../../shared/validation/zod-query.pipe.js';
import { AdminTwoFactorGuard, clientIp } from '../../admin/api/admin-two-factor.guard.js';
import { ApplicationReview } from '../application/application-review.js';
import type { ReviewActor } from '../application/ports.js';
import { UploadService } from '../application/uploads.js';

const uuid = new ParseUUIDPipe();
const actor = (p: AuthPrincipal, req: Request): ReviewActor => ({
  userId: p.userId,
  roles: p.roles,
  ip: clientIp(req),
});

/** Ops review of rider/vendor applications (ops, super_admin; bearer + TOTP 2FA session). */
@Controller('v1/admin')
@UseGuards(AuthGuard, AdminTwoFactorGuard)
@Roles('ops', 'super_admin')
export class AdminReviewController {
  /** @param review use cases @param uploads upload service */
  constructor(
    private readonly review: ApplicationReview,
    private readonly uploads: UploadService,
  ) {}

  /** GET /v1/admin/rider-applications */
  @Get('rider-applications')
  async riders(
    @Query(new ZodQueryPipe(ListApplicationsQuerySchema)) q: ListApplicationsQuery,
  ): Promise<AdminRiderApplicationList> {
    return { items: await this.review.listRiders(q.status) };
  }

  /** POST /v1/admin/rider-applications/{id}/approve */
  @Post('rider-applications/:id/approve')
  @HttpCode(200)
  @Idempotent()
  approveRider(
    @Principal() p: AuthPrincipal,
    @Req() req: Request,
    @Param('id', uuid) id: string,
    @Body(new ZodBodyPipe(ReviewDecisionSchema)) b: ReviewDecision,
  ): Promise<RiderApplication> {
    return this.review.decideRider(actor(p, req), id, 'approved', b.reason);
  }

  /** POST /v1/admin/rider-applications/{id}/reject */
  @Post('rider-applications/:id/reject')
  @HttpCode(200)
  @Idempotent()
  rejectRider(
    @Principal() p: AuthPrincipal,
    @Req() req: Request,
    @Param('id', uuid) id: string,
    @Body(new ZodBodyPipe(ReviewDecisionSchema)) b: ReviewDecision,
  ): Promise<RiderApplication> {
    return this.review.decideRider(actor(p, req), id, 'rejected', b.reason);
  }

  /** GET /v1/admin/vendor-applications */
  @Get('vendor-applications')
  async vendors(
    @Query(new ZodQueryPipe(ListApplicationsQuerySchema)) q: ListApplicationsQuery,
  ): Promise<AdminVendorApplicationList> {
    return { items: await this.review.listVendors(q.status) };
  }

  /** POST /v1/admin/vendor-applications/{id}/approve */
  @Post('vendor-applications/:id/approve')
  @HttpCode(200)
  @Idempotent()
  approveVendor(
    @Principal() p: AuthPrincipal,
    @Req() req: Request,
    @Param('id', uuid) id: string,
    @Body(new ZodBodyPipe(ReviewDecisionSchema)) b: ReviewDecision,
  ): Promise<VendorApplication> {
    return this.review.decideVendor(actor(p, req), id, 'approved', b.reason);
  }

  /** POST /v1/admin/vendor-applications/{id}/reject */
  @Post('vendor-applications/:id/reject')
  @HttpCode(200)
  @Idempotent()
  rejectVendor(
    @Principal() p: AuthPrincipal,
    @Req() req: Request,
    @Param('id', uuid) id: string,
    @Body(new ZodBodyPipe(ReviewDecisionSchema)) b: ReviewDecision,
  ): Promise<VendorApplication> {
    return this.review.decideVendor(actor(p, req), id, 'rejected', b.reason);
  }

  /** GET /v1/admin/uploads/{id}/download-url */
  @Get('uploads/:id/download-url')
  downloadUrl(
    @Principal() p: AuthPrincipal,
    @Req() req: Request,
    @Param('id', uuid) id: string,
  ): Promise<DownloadUrl> {
    return this.uploads.downloadUrl(actor(p, req), id);
  }
}
