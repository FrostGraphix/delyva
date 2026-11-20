import type { Address } from '@delyva/contracts';
import { toAddressDto } from './address-dto.js';
import type { AddressRepository } from './ports.js';

/** Query: the caller's saved addresses. */
export class ListAddresses {
  /** @param addresses repository */
  constructor(private readonly addresses: AddressRepository) {}

  /** Executes the query. */
  async execute(userId: string): Promise<Address[]> {
    return (await this.addresses.listByUser(userId)).map(toAddressDto);
  }
}
