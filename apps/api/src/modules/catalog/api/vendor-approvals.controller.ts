import { Controller, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { VendorDetail } from '@delyva/contracts';
import { AuthGuard, Roles } from '../../../shared/auth/auth.guard.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ApproveVendor } from '../application/approve-vendor.use-case.js';

/**
 * Ops approval of vendors. DEBT(admin): approval reason + immutable audit log not recorded yet —
 * admin context not built — write an audit entry once admin/audit exists.
 */
@Controller('v1/vendors/:vendorId')
@UseGuards(AuthGuard)
@Roles('ops', 'super_admin')
export class VendorApprovalsController {
  /** @param approve use case */
  constructor(private readonly approve: ApproveVendor) {}

  /** POST /v1/vendors/{vendorId}/go-live */
  @Post('go-live')
  @HttpCode(200)
  @Idempotent()
  goLive(@Param('vendorId', ParseUUIDPipe) vendorId: string): Promise<VendorDetail> {
    return this.approve.execute(vendorId);
  }
}
