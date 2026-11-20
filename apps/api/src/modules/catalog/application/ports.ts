import type {
  CreateModifierGroup,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  UpdateMenuItem,
  VendorCategory,
  VendorDetail,
} from '@delyva/contracts';
import type { LatLng } from '@delyva/utils';
import type { WeeklyInterval } from '../domain/opening-hours.js';
import type { VendorMemberRole, VendorStatus } from '../domain/vendor.js';

/** A live vendor's branch that could serve a customer point. */
export interface BranchCandidate {
  readonly branchId: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly category: VendorCategory;
  readonly zoneId: string;
  readonly location: LatLng;
  readonly prepMinutes: number;
  readonly hours: readonly WeeklyInterval[];
}

/** Vendor detail before open-now evaluation. */
export type VendorAggregate = Omit<VendorDetail, 'branches'> & {
  readonly branches: Omit<VendorDetail['branches'][number], 'isOpenNow'>[];
};

/** Read side of the catalog (discovery and menus). */
export interface CatalogReadRepository {
  /** Active branches of live vendors located in any of the zones. */
  liveBranchesInZones(
    zoneIds: readonly string[],
    category?: VendorCategory,
  ): Promise<BranchCandidate[]>;
  /** Full vendor with branches, hours and menu; null when missing. */
  vendorAggregate(vendorId: string): Promise<VendorAggregate | null>;
}

/** New menu item. */
export interface NewMenuItem {
  readonly id: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceMinor: number;
  readonly available: boolean;
}

/** New modifier group with generated ids. */
export interface NewModifierGroup extends Omit<CreateModifierGroup, 'options'> {
  readonly id: string;
  readonly options: readonly { id: string; name: string; priceDeltaMinor: number }[];
}

/**
 * Write side of the catalog. Every method is scoped by `vendorId` so a resource of another vendor
 * resolves to null (IDOR defence in the query itself). Events go to the outbox in the same tx.
 */
export interface CatalogWriteRepository {
  /** Membership role of the user in the vendor, or null. */
  memberRole(vendorId: string, userId: string): Promise<VendorMemberRole | null>;
  /** Inserts an item; null when the category is not the vendor's. */
  createItem(vendorId: string, item: NewMenuItem): Promise<MenuItem | null>;
  /** Updates an item; null when item/category is not the vendor's. */
  updateItem(vendorId: string, itemId: string, changes: UpdateMenuItem): Promise<MenuItem | null>;
  /** Toggles item availability and emits `catalog.item.availability_changed`. */
  setItemAvailability(
    vendorId: string,
    itemId: string,
    available: boolean,
  ): Promise<MenuItem | null>;
  /** Toggles option availability and emits `catalog.item.availability_changed`. */
  setOptionAvailability(
    vendorId: string,
    optionId: string,
    available: boolean,
  ): Promise<ModifierOption | null>;
  /** Attaches a modifier group to the vendor's item; null when the item is not the vendor's. */
  createModifierGroup(
    vendorId: string,
    itemId: string,
    group: NewModifierGroup,
  ): Promise<ModifierGroup | null>;
  /** Replaces a branch's weekly hours; false when the branch is not the vendor's. */
  replaceHours(
    vendorId: string,
    branchId: string,
    hours: readonly WeeklyInterval[],
  ): Promise<boolean>;
  /** Current vendor status, or null. */
  vendorStatus(vendorId: string): Promise<VendorStatus | null>;
  /**
   * Compare-and-set status; emits `catalog.vendor.went_live` when `to` is live.
   * Returns false when the status changed concurrently.
   */
  changeStatus(vendorId: string, from: VendorStatus, to: VendorStatus): Promise<boolean>;
}

/** What catalog needs from the geo context (satisfied by geo's GeoService). */
export interface GeoLookup {
  /** Zone ids covering the point. */
  zonesContaining(point: LatLng): Promise<string[]>;
  /** Distance and customer-facing ETA (prep + travel + handling). */
  deliveryEstimate(
    from: LatLng,
    to: LatLng,
    prepMinutes: number,
  ): Promise<{ distanceMeters: number; etaMinutes: number }>;
}

/** Clock and id source, injectable for tests. */
export interface Clock {
  /** Current time. */
  now(): Date;
  /** New UUID v4. */
  uuid(): string;
}
