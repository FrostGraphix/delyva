import type { Address, UpdateAddress as UpdateAddressInput } from '@delyva/contracts';
import { GeoError } from '../domain/geo-errors.js';
import { toAddressDto } from './address-dto.js';
import type { AddressRepository } from './ports.js';

/** Command: update one of the caller's addresses (ownership enforced in the repository query). */
export class UpdateAddress {
  /** @param addresses repository */
  constructor(private readonly addresses: AddressRepository) {}

  /** Executes the command. @throws GeoError not_found for missing or foreign ids */
  async execute(userId: string, id: string, input: UpdateAddressInput): Promise<Address> {
    const updated = await this.addresses.update(userId, id, input);
    if (!updated) throw new GeoError('not_found', 'Address not found.');
    return toAddressDto(updated);
  }
}
