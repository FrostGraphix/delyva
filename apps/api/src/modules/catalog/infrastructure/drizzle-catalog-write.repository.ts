import { randomUUID } from 'node:crypto';
import type {
  ItemAvailabilityChangedPayload,
  MenuItem,
  ModifierGroup,
  ModifierOption,
  UpdateMenuItem,
  VendorWentLivePayload,
} from '@delyva/contracts';
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import { appendToOutbox } from '../../../shared/outbox/outbox.writer.js';
import type {
  CatalogWriteRepository,
  NewMenuItem,
  NewModifierGroup,
} from '../application/ports.js';
import type { WeeklyInterval } from '../domain/opening-hours.js';
import type { VendorMemberRole, VendorStatus } from '../domain/vendor.js';
import { loadItems } from './drizzle-catalog-read.repository.js';
import {
  branches,
  branchOpeningHours,
  menuCategories,
  menuItems,
  modifierGroups,
  modifierOptions,
  vendorMembers,
  vendors,
} from './catalog.schema.js';

/** Drizzle write adapter; every statement is scoped by `vendor_id` (IDOR-safe by construction). */
export class DrizzleCatalogWriteRepository implements CatalogWriteRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async memberRole(vendorId: string, userId: string): Promise<VendorMemberRole | null> {
    const [row] = await this.db
      .select({ role: vendorMembers.role })
      .from(vendorMembers)
      .where(and(eq(vendorMembers.vendorId, vendorId), eq(vendorMembers.userId, userId)));
    return (row?.role as VendorMemberRole | undefined) ?? null;
  }

  private async ownsCategory(vendorId: string, categoryId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: menuCategories.id })
      .from(menuCategories)
      .where(and(eq(menuCategories.id, categoryId), eq(menuCategories.vendorId, vendorId)));
    return rows.length > 0;
  }

  private async item(vendorId: string, itemId: string): Promise<MenuItem | null> {
    return (await loadItems(this.db, vendorId, itemId))[0] ?? null;
  }

  /** @inheritdoc */
  async createItem(vendorId: string, item: NewMenuItem): Promise<MenuItem | null> {
    if (!(await this.ownsCategory(vendorId, item.categoryId))) return null;
    await this.db.insert(menuItems).values({ ...item, vendorId });
    return this.item(vendorId, item.id);
  }

  /** @inheritdoc */
  async updateItem(vendorId: string, itemId: string, c: UpdateMenuItem): Promise<MenuItem | null> {
    if (c.categoryId && !(await this.ownsCategory(vendorId, c.categoryId))) return null;
    const rows = await this.db
      .update(menuItems)
      .set({
        ...(c.categoryId ? { categoryId: c.categoryId } : {}),
        ...(c.name !== undefined ? { name: c.name } : {}),
        ...(c.description !== undefined ? { description: c.description } : {}),
        ...(c.price ? { priceMinor: c.price.amountMinor } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(menuItems.id, itemId), eq(menuItems.vendorId, vendorId)))
      .returning({ id: menuItems.id });
    return rows.length > 0 ? this.item(vendorId, itemId) : null;
  }

  /** @inheritdoc */
  async setItemAvailability(
    vendorId: string,
    itemId: string,
    available: boolean,
  ): Promise<MenuItem | null> {
    const changed = await this.db.transaction(async (tx) => {
      const rows = await tx
        .update(menuItems)
        .set({ available, updatedAt: sql`now()` })
        .where(and(eq(menuItems.id, itemId), eq(menuItems.vendorId, vendorId)))
        .returning({ id: menuItems.id });
      if (rows.length === 0) return false;
      await appendToOutbox<ItemAvailabilityChangedPayload>(tx, {
        type: 'catalog.item.availability_changed',
        aggregateType: 'menu_item',
        aggregateId: itemId,
        payload: { vendorId, itemId, optionId: null, available },
      });
      return true;
    });
    return changed ? this.item(vendorId, itemId) : null;
  }

  /** @inheritdoc */
  async setOptionAvailability(
    vendorId: string,
    optionId: string,
    available: boolean,
  ): Promise<ModifierOption | null> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(modifierOptions)
        .set({ available })
        .where(and(eq(modifierOptions.id, optionId), eq(modifierOptions.vendorId, vendorId)))
        .returning();
      if (!row) return null;
      const [group] = await tx
        .select({ itemId: modifierGroups.itemId })
        .from(modifierGroups)
        .where(eq(modifierGroups.id, row.groupId));
      if (!group) throw new Error('modifier option without group');
      await appendToOutbox<ItemAvailabilityChangedPayload>(tx, {
        type: 'catalog.item.availability_changed',
        aggregateType: 'menu_item',
        aggregateId: group.itemId,
        payload: { vendorId, itemId: group.itemId, optionId, available },
      });
      return {
        id: row.id,
        name: row.name,
        priceDelta: { amountMinor: row.priceDeltaMinor, currency: 'NGN' as const },
        available: row.available,
      };
    });
  }

  /** @inheritdoc */
  async createModifierGroup(
    vendorId: string,
    itemId: string,
    g: NewModifierGroup,
  ): Promise<ModifierGroup | null> {
    if (!(await this.item(vendorId, itemId))) return null;
    await this.db.transaction(async (tx) => {
      await tx.insert(modifierGroups).values({
        id: g.id,
        vendorId,
        itemId,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
      });
      await tx
        .insert(modifierOptions)
        .values(g.options.map((o, position) => ({ ...o, vendorId, groupId: g.id, position })));
    });
    const item = await this.item(vendorId, itemId);
    return item?.modifierGroups.find((x) => x.id === g.id) ?? null;
  }

  /** @inheritdoc */
  async replaceHours(
    vendorId: string,
    branchId: string,
    hours: readonly WeeklyInterval[],
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.id, branchId), eq(branches.vendorId, vendorId)))
        .for('update');
      if (owned.length === 0) return false;
      await tx.delete(branchOpeningHours).where(eq(branchOpeningHours.branchId, branchId));
      if (hours.length > 0) {
        await tx
          .insert(branchOpeningHours)
          .values(hours.map((h) => ({ ...h, id: randomUUID(), branchId })));
      }
      return true;
    });
  }

  /** @inheritdoc */
  async vendorStatus(vendorId: string): Promise<VendorStatus | null> {
    const [row] = await this.db
      .select({ status: vendors.status })
      .from(vendors)
      .where(eq(vendors.id, vendorId));
    return (row?.status as VendorStatus | undefined) ?? null;
  }

  /** @inheritdoc */
  async changeStatus(vendorId: string, from: VendorStatus, to: VendorStatus): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(vendors)
        .set({ status: to, updatedAt: sql`now()` })
        .where(and(eq(vendors.id, vendorId), eq(vendors.status, from)))
        .returning({ id: vendors.id });
      if (rows.length === 0) return false;
      if (to === 'live') {
        await appendToOutbox<VendorWentLivePayload>(tx, {
          type: 'catalog.vendor.went_live',
          aggregateType: 'vendor',
          aggregateId: vendorId,
          payload: { vendorId },
        });
      }
      return true;
    });
  }
}
