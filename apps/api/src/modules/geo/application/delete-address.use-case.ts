import { GeoError } from '../domain/geo-errors.js';
import type { AddressRepository } from './ports.js';

/** Command: delete one of the caller's addresses (ownership enforced in the repository query). */
export class DeleteAddress {
  /** @param addresses repository */
  constructor(private readonly addresses: AddressRepository) {}

  /** Executes the command. @throws GeoError not_found for missing or foreign ids */
  async execute(userId: string, id: string): Promise<void> {
    if (!(await this.addresses.delete(userId, id))) {
      throw new GeoError('not_found', 'Address not found.');
    }
  }
}
