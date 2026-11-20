import type { OpeningHoursEntry } from '@delyva/contracts';
import { assertValidWeeklyHours } from '../domain/opening-hours.js';
import type { CatalogWriteRepository } from './ports.js';
import { assertVendorAccess, found } from './vendor-access.js';

/** Command: replace a branch's weekly hours (owner only). Overlaps are rejected. */
export class ReplaceOpeningHours {
  /** @param catalog write repository */
  constructor(private readonly catalog: CatalogWriteRepository) {}

  /** Executes the command. @throws CatalogError forbidden | not_found | validation_failed */
  async execute(
    userId: string,
    vendorId: string,
    branchId: string,
    hours: OpeningHoursEntry[],
  ): Promise<OpeningHoursEntry[]> {
    await assertVendorAccess(this.catalog, vendorId, userId, 'manage_hours');
    assertValidWeeklyHours(hours);
    found(await this.catalog.replaceHours(vendorId, branchId, hours), 'Branch');
    return hours;
  }
}
