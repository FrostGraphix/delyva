import { Controller, Get, UseGuards } from '@nestjs/common';
import type { MyVendorList } from '@delyva/contracts';
import {
  type AuthPrincipal,
  AuthGuard,
  Principal,
  Roles,
} from '../../../shared/auth/auth.guard.js';
import { ListMyVendors } from '../application/list-my-vendors.query.js';

/** GET /v1/me/vendors — the caller's own vendor memberships (vendor portal bootstrap). */
@Controller('v1/me/vendors')
@UseGuards(AuthGuard)
@Roles('vendor_owner', 'vendor_staff')
export class MyVendorsController {
  /** @param query injected query */
  constructor(private readonly query: ListMyVendors) {}

  /** Lists vendors the principal belongs to. */
  @Get()
  list(@Principal() principal: AuthPrincipal): Promise<MyVendorList> {
    return this.query.execute(principal.userId);
  }
}
