import type { LatLng } from '@delyva/utils';
import type { TravelEstimate } from '../domain/eta.js';

/** A stored customer address (PII: line1/landmark are never logged). */
export interface AddressRecord {
  readonly id: string;
  readonly userId: string;
  readonly label: string;
  readonly line1: string;
  readonly landmark: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly createdAt: Date;
}

/** Mutable address fields. */
export type AddressChanges = Partial<
  Pick<AddressRecord, 'label' | 'line1' | 'landmark' | 'lat' | 'lng'>
>;

/** Persistence for addresses. Every method is scoped by owner so foreign ids are invisible. */
export interface AddressRepository {
  /** Addresses of the user, newest first. */
  listByUser(userId: string): Promise<AddressRecord[]>;
  /** Number of addresses the user has. */
  countByUser(userId: string): Promise<number>;
  /** Inserts an address. */
  create(address: AddressRecord): Promise<void>;
  /** Applies changes to the user's address; null when it does not exist for that user. */
  update(userId: string, id: string, changes: AddressChanges): Promise<AddressRecord | null>;
  /** Deletes the user's address; false when it does not exist for that user. */
  delete(userId: string, id: string): Promise<boolean>;
  /** The user's address; null when it does not exist for that user. */
  findForUser(userId: string, id: string): Promise<AddressRecord | null>;
}

/** A delivery zone reference with its city (used to map to a pricing zone code). */
export interface ZoneRef {
  readonly id: string;
  readonly city: string;
  readonly name: string;
}

/** Delivery-zone lookups (PostGIS). */
export interface ZoneRepository {
  /** Ids of active zones whose polygon covers the point. */
  zoneIdsContaining(point: LatLng): Promise<string[]>;
  /** Active zones (with city) whose polygon covers the point. */
  zonesContaining(point: LatLng): Promise<ZoneRef[]>;
}

/** Distance/ETA provider (haversine heuristic now; Google Distance Matrix later). */
export interface EtaProvider {
  /** Estimates travel between two points. */
  estimate(from: LatLng, to: LatLng): Promise<TravelEstimate>;
}

/** Clock and id source, injectable for tests. */
export interface Clock {
  /** Current time. */
  now(): Date;
  /** New UUID v4. */
  uuid(): string;
}
