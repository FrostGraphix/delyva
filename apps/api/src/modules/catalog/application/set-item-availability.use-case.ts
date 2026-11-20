import type { MenuItem } from '@delyva/contracts';
import type { CatalogWriteRepository } from './ports.js';
import { assertVendorAccess, found } from './vendor-access.js';

/** Command: mark an item available/sold out (owner or staff); emits `catalog.item.availability_changed`. */
export class SetItemAvailability {
  /** @param catalog write repository */
  constructor(private readonly catalog: CatalogWriteRepository) {}

  /** Executes the command. @throws CatalogError forbidden | not_found */
  async execute(
    userId: string,
    vendorId: string,
    itemId: string,
    available: boolean,
  ): Promise<MenuItem> {
    await assertVendorAccess(this.catalog, vendorId, userId, 'toggle_availability');
    return found(await this.catalog.setItemAvailability(vendorId, itemId, available), 'Menu item');
  }
}
