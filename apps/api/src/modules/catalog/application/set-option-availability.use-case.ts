import type { ModifierOption } from '@delyva/contracts';
import type { CatalogWriteRepository } from './ports.js';
import { assertVendorAccess, found } from './vendor-access.js';

/** Command: mark a modifier option available/sold out (owner or staff); emits an availability event. */
export class SetOptionAvailability {
  /** @param catalog write repository */
  constructor(private readonly catalog: CatalogWriteRepository) {}

  /** Executes the command. @throws CatalogError forbidden | not_found */
  async execute(
    userId: string,
    vendorId: string,
    optionId: string,
    available: boolean,
  ): Promise<ModifierOption> {
    await assertVendorAccess(this.catalog, vendorId, userId, 'toggle_availability');
    return found(
      await this.catalog.setOptionAvailability(vendorId, optionId, available),
      'Modifier option',
    );
  }
}
