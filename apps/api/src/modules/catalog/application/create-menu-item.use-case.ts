import type { CreateMenuItem as CreateMenuItemInput, MenuItem } from '@delyva/contracts';
import { catalogPrice } from '../domain/vendor.js';
import type { CatalogWriteRepository, Clock } from './ports.js';
import { assertVendorAccess, found } from './vendor-access.js';

/** Command: add an item to one of the vendor's menu categories (owner only). */
export class CreateMenuItem {
  /** @param deps write repository and clock */
  constructor(private readonly deps: { catalog: CatalogWriteRepository; clock: Clock }) {}

  /** Executes the command. @throws CatalogError forbidden | not_found | validation_failed */
  async execute(userId: string, vendorId: string, input: CreateMenuItemInput): Promise<MenuItem> {
    const { catalog, clock } = this.deps;
    await assertVendorAccess(catalog, vendorId, userId, 'manage_menu');
    const price = catalogPrice(input.price.amountMinor);
    const item = await catalog.createItem(vendorId, {
      id: clock.uuid(),
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? null,
      priceMinor: price.minor,
      available: input.available ?? true,
    });
    return found(item, 'Menu category');
  }
}
