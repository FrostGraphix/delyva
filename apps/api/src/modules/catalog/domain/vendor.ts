import { Money } from '@delyva/utils';
import { CatalogError } from './catalog-errors.js';

/** Vendor lifecycle status (mirrors contracts VendorStatus). */
export type VendorStatus = 'draft' | 'in_review' | 'live' | 'suspended';

/** Allowed vendor status transitions; anything else is rejected. */
export const VENDOR_TRANSITIONS: Readonly<Record<VendorStatus, readonly VendorStatus[]>> = {
  draft: ['in_review'],
  in_review: ['live', 'draft'],
  live: ['suspended'],
  suspended: ['live'],
};

/** Returns `to` when the transition is allowed. @throws CatalogError conflict */
export function transitionVendor(from: VendorStatus, to: VendorStatus): VendorStatus {
  if (!VENDOR_TRANSITIONS[from].includes(to)) {
    throw new CatalogError('conflict', `Vendor cannot move from ${from} to ${to}`);
  }
  return to;
}

/** Membership role of a user within a vendor. */
export type VendorMemberRole = 'owner' | 'staff';

/** Catalog actions guarded by vendor membership role. */
export type VendorAction = 'manage_menu' | 'toggle_availability' | 'manage_hours';

const ALLOWED: Readonly<Record<VendorMemberRole, readonly VendorAction[]>> = {
  owner: ['manage_menu', 'toggle_availability', 'manage_hours'],
  staff: ['toggle_availability'],
};

/** Whether a vendor member role may perform the action. */
export function memberCan(role: VendorMemberRole, action: VendorAction): boolean {
  return ALLOWED[role].includes(action);
}

/** Validates a catalog price as NGN integer kobo via the Money value object. @throws CatalogError */
export function catalogPrice(amountMinor: number): Money {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new CatalogError('validation_failed', 'Price must be a non-negative integer in kobo');
  }
  return Money.ofMinor(amountMinor, 'NGN');
}
