import type { MenuItem, UpdateMenuItem as UpdateMenuItemInput } from '@delyva/contracts';
import { catalogPrice } from '../domain/vendor.js';
import type { CatalogWriteRepository } from './ports.js';
import { assertVendorAccess, found } from './vendor-access.js';

/** Command: edit one of the vendor's items (owner only). */
export class UpdateMenuItem {
  /** @param catalog write repository */
  constructor(private readonly catalog: CatalogWriteRepository) {}

  /** Executes the command. @throws CatalogError forbidden | not_found | validation_failed */
  async execute(
    userId: string,
    vendorId: string,
    itemId: string,
    input: UpdateMenuItemInput,
  ): Promise<MenuItem> {
    await assertVendorAccess(this.catalog, vendorId, userId, 'manage_menu');
    if (input.price) catalogPrice(input.price.amountMinor);
    return found(await this.catalog.updateItem(vendorId, itemId, input), 'Menu item');
  }
}
