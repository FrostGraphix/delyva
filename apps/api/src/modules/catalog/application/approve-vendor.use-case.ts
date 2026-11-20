import type { VendorDetail } from '@delyva/contracts';
import { CatalogError } from '../domain/catalog-errors.js';
import { transitionVendor } from '../domain/vendor.js';
import { withOpenNow } from './get-vendor.query.js';
import type { CatalogReadRepository, CatalogWriteRepository, Clock } from './ports.js';

/** Command (ops): approve an in-review (or reinstate a suspended) vendor; emits `catalog.vendor.went_live`. */
export class ApproveVendor {
  /** @param deps repositories and clock */
  constructor(
    private readonly deps: {
      reads: CatalogReadRepository;
      writes: CatalogWriteRepository;
      clock: Clock;
    },
  ) {}

  /** Executes the command. @throws CatalogError not_found | conflict */
  async execute(vendorId: string): Promise<VendorDetail> {
    const { reads, writes, clock } = this.deps;
    const status = await writes.vendorStatus(vendorId);
    if (!status) throw new CatalogError('not_found', 'Vendor not found.');
    transitionVendor(status, 'live');
    if (!(await writes.changeStatus(vendorId, status, 'live'))) {
      throw new CatalogError('conflict', 'Vendor status changed concurrently; retry.');
    }
    const vendor = await reads.vendorAggregate(vendorId);
    if (!vendor) throw new CatalogError('not_found', 'Vendor not found.');
    return withOpenNow(vendor, clock.now());
  }
}
