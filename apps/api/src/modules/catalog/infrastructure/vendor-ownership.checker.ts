import type { Principal } from '../../../shared/auth/access-token.verifier.js';
import type { OwnershipChecker } from '../../../shared/auth/ownership.guard.js';
import type { CatalogWriteRepository } from '../application/ports.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ownership for `{vendorId}` routes: the caller must be an owner or staff member of the vendor. */
export class VendorOwnershipChecker implements OwnershipChecker {
  /** @param repo membership lookup */
  constructor(private readonly repo: Pick<CatalogWriteRepository, 'memberRole'>) {}

  /** @inheritdoc */
  async canAccess(principal: Principal, vendorId: string): Promise<boolean> {
    if (!UUID.test(vendorId)) return false;
    return (await this.repo.memberRole(vendorId, principal.userId)) !== null;
  }
}
