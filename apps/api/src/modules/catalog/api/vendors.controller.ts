import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  type DiscoverVendorsQuery,
  DiscoverVendorsQuerySchema,
  type DiscoverVendorsResponse,
  type VendorDetail,
} from '@delyva/contracts';
import { ZodQueryPipe } from '../../../shared/validation/zod-query.pipe.js';
import { DiscoverVendors } from '../application/discover-vendors.query.js';
import { GetVendor } from '../application/get-vendor.query.js';

/** Public customer discovery endpoints (guests may browse). */
@Controller('v1/vendors')
export class VendorsController {
  /** Injected queries. */
  constructor(
    private readonly discover: DiscoverVendors,
    private readonly getVendor: GetVendor,
  ) {}

  /** GET /v1/vendors?lat=&lng=&category= — open, in-zone vendors, fastest first. */
  @Get()
  async list(
    @Query(new ZodQueryPipe(DiscoverVendorsQuerySchema)) query: DiscoverVendorsQuery,
  ): Promise<DiscoverVendorsResponse> {
    // DEBT(catalog): no Redis/CDN cache yet — read-heavy endpoint — cache by zone+category, invalidate on menu/hours events.
    return { items: await this.discover.execute(query) };
  }

  /** GET /v1/vendors/{vendorId} — live vendor with menu. */
  @Get(':vendorId')
  detail(@Param('vendorId', ParseUUIDPipe) vendorId: string): Promise<VendorDetail> {
    return this.getVendor.execute(vendorId);
  }
}
