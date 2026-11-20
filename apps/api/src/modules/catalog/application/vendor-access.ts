import { CatalogError } from '../domain/catalog-errors.js';
import { memberCan, type VendorAction } from '../domain/vendor.js';
import type { CatalogWriteRepository } from './ports.js';

/**
 * Use-case level ownership check (defence in depth behind the OwnershipGuard): the user must be a
 * member of the vendor whose role permits the action. @throws CatalogError forbidden
 */
export async function assertVendorAccess(
  repo: Pick<CatalogWriteRepository, 'memberRole'>,
  vendorId: string,
  userId: string,
  action: VendorAction,
): Promise<void> {
  const role = await repo.memberRole(vendorId, userId);
  if (!role || !memberCan(role, action)) {
    throw new CatalogError('forbidden', 'You do not have access to this vendor.');
  }
}

/** Throws not_found when a vendor-scoped write matched nothing. */
export function found<T>(value: T | null | false, what: string): T {
  if (value === null || value === false) throw new CatalogError('not_found', `${what} not found.`);
  return value;
}
