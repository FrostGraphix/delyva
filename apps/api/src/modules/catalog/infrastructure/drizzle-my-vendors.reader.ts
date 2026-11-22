import type { MyVendor } from '@delyva/contracts';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import type { MyVendorsReader } from '../application/list-my-vendors.query.js';
import { branches, vendorMembers, vendors } from './catalog.schema.js';

/** Drizzle adapter for {@link MyVendorsReader}; always filtered by the caller's user id. */
export class DrizzleMyVendorsReader implements MyVendorsReader {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async vendorsOf(userId: string): Promise<readonly MyVendor[]> {
    const rows = await this.db
      .select({
        id: vendors.id,
        name: vendors.name,
        status: vendors.status,
        role: vendorMembers.role,
      })
      .from(vendorMembers)
      .innerJoin(vendors, eq(vendors.id, vendorMembers.vendorId))
      .where(eq(vendorMembers.userId, userId))
      .orderBy(asc(vendorMembers.createdAt));
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const bs = await this.db
      .select({ id: branches.id, vendorId: branches.vendorId })
      .from(branches)
      .where(and(inArray(branches.vendorId, ids), eq(branches.active, true)))
      .orderBy(asc(branches.createdAt));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status as MyVendor['status'],
      role: r.role as MyVendor['role'],
      branchIds: bs.filter((b) => b.vendorId === r.id).map((b) => b.id),
    }));
  }
}
