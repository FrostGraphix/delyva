import type {
  CreateModifierGroup as CreateModifierGroupInput,
  ModifierGroup,
} from '@delyva/contracts';
import { assertValidModifierGroup } from '../domain/modifiers.js';
import { catalogPrice } from '../domain/vendor.js';
import type { CatalogWriteRepository, Clock } from './ports.js';
import { assertVendorAccess, found } from './vendor-access.js';

/** Command: attach a modifier group (with options) to one of the vendor's items (owner only). */
export class CreateModifierGroup {
  /** @param deps write repository and clock */
  constructor(private readonly deps: { catalog: CatalogWriteRepository; clock: Clock }) {}

  /** Executes the command. @throws CatalogError forbidden | not_found | validation_failed */
  async execute(
    userId: string,
    vendorId: string,
    itemId: string,
    input: CreateModifierGroupInput,
  ): Promise<ModifierGroup> {
    const { catalog, clock } = this.deps;
    await assertVendorAccess(catalog, vendorId, userId, 'manage_menu');
    assertValidModifierGroup({ ...input, optionCount: input.options.length });
    const group = await catalog.createModifierGroup(vendorId, itemId, {
      id: clock.uuid(),
      name: input.name,
      minSelect: input.minSelect,
      maxSelect: input.maxSelect,
      options: input.options.map((o) => ({
        id: clock.uuid(),
        name: o.name,
        priceDeltaMinor: catalogPrice(o.priceDelta.amountMinor).minor,
      })),
    });
    return found(group, 'Menu item');
  }
}
