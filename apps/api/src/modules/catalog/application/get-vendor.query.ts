import type { VendorDetail } from '@delyva/contracts';
import { CatalogError } from '../domain/catalog-errors.js';
import { isOpenAt } from '../domain/opening-hours.js';
import type { CatalogReadRepository, Clock, VendorAggregate } from './ports.js';

/** Adds `isOpenNow` to each branch. */
export function withOpenNow(v: VendorAggregate, now: Date): VendorDetail {
  return {
    ...v,
    branches: v.branches.map((b) => ({ ...b, isOpenNow: isOpenAt(b.openingHours, now) })),
  };
}

/** Query: a live vendor with branches, hours and full menu (non-live vendors are 404 to customers). */
export class GetVendor {
  /** @param deps read repository and clock */
  constructor(private readonly deps: { catalog: CatalogReadRepository; clock: Clock }) {}

  /** Executes the query. @throws CatalogError not_found */
  async execute(vendorId: string): Promise<VendorDetail> {
    const vendor = await this.deps.catalog.vendorAggregate(vendorId);
    if (vendor?.status !== 'live') throw new CatalogError('not_found', 'Vendor not found.');
    return withOpenNow(vendor, this.deps.clock.now());
  }
}
