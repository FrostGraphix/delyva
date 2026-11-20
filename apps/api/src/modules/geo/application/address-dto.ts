import type { Address } from '@delyva/contracts';
import type { AddressRecord } from './ports.js';

/** Maps a stored address to its contract shape (drops the owner id). */
export function toAddressDto(a: AddressRecord): Address {
  return {
    id: a.id,
    label: a.label,
    line1: a.line1,
    landmark: a.landmark,
    lat: a.lat,
    lng: a.lng,
    createdAt: a.createdAt.toISOString(),
  };
}
