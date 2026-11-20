import type { Address, CreateAddress as CreateAddressInput } from '@delyva/contracts';
import { GeoError, MAX_ADDRESSES_PER_USER } from '../domain/geo-errors.js';
import { toAddressDto } from './address-dto.js';
import type { AddressRecord, AddressRepository, Clock } from './ports.js';

/** Command: save a new address for the caller (max {@link MAX_ADDRESSES_PER_USER}). */
export class CreateAddress {
  /** @param deps repository and clock */
  constructor(private readonly deps: { addresses: AddressRepository; clock: Clock }) {}

  /** Executes the command. @throws GeoError conflict when the limit is reached */
  async execute(userId: string, input: CreateAddressInput): Promise<Address> {
    const { addresses, clock } = this.deps;
    if ((await addresses.countByUser(userId)) >= MAX_ADDRESSES_PER_USER) {
      throw new GeoError('conflict', `You can save up to ${MAX_ADDRESSES_PER_USER} addresses.`);
    }
    const record: AddressRecord = {
      id: clock.uuid(),
      userId,
      label: input.label,
      line1: input.line1,
      landmark: input.landmark ?? null,
      lat: input.lat,
      lng: input.lng,
      createdAt: clock.now(),
    };
    await addresses.create(record);
    return toAddressDto(record);
  }
}
