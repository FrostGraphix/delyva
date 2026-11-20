import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import type {
  CatalogOnboardingRepository,
  DraftMenu,
  NewBranch,
  VendorProfile,
} from '../application/vendor-onboarding.service.js';
import {
  branches,
  menuCategories,
  menuItems,
  menus,
  vendorMembers,
  vendors,
} from './catalog.schema.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Drizzle adapter for {@link CatalogOnboardingRepository}; every statement is vendor-scoped. */
export class DrizzleCatalogOnboardingRepository implements CatalogOnboardingRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async createDraftVendor(vendorId: string, p: VendorProfile, ownerUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(vendors).values({
        id: vendorId,
        name: p.name,
        category: p.category,
        description: p.description,
        status: 'draft',
      });
      await tx.insert(vendorMembers).values({ vendorId, userId: ownerUserId, role: 'owner' });
    });
  }

  /** @inheritdoc */
  async updateDraftVendor(vendorId: string, p: VendorProfile): Promise<boolean> {
    const rows = await this.db
      .update(vendors)
      .set({
        name: p.name,
        category: p.category,
        description: p.description,
        updatedAt: sql`now()`,
      })
      .where(and(eq(vendors.id, vendorId), eq(vendors.status, 'draft')))
      .returning({ id: vendors.id });
    return rows.length > 0;
  }

  /** @inheritdoc */
  async upsertBranch(vendorId: string, b: NewBranch): Promise<void> {
    const location = sql`ST_SetSRID(ST_MakePoint(${b.location.lng}, ${b.location.lat}), 4326)`;
    await this.db
      .insert(branches)
      .values({
        id: b.id,
        vendorId,
        name: b.name,
        location,
        zoneId: b.zoneId,
        prepMinutes: b.prepMinutes,
      })
      .onConflictDoUpdate({
        target: branches.id,
        set: {
          name: b.name,
          location,
          zoneId: b.zoneId,
          prepMinutes: b.prepMinutes,
          updatedAt: sql`now()`,
        },
        setWhere: eq(branches.vendorId, vendorId),
      });
  }

  /** @inheritdoc */
  async replaceDraftMenu(
    vendorId: string,
    menuId: string,
    previous: string | null,
    menu: DraftMenu,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (previous) await this.deleteDraft(tx, vendorId, previous);
      await tx.insert(menus).values({ id: menuId, vendorId, name: 'Imported menu', active: false });
      for (const [position, c] of menu.categories.entries()) {
        const categoryId = randomUUID();
        await tx
          .insert(menuCategories)
          .values({ id: categoryId, menuId, vendorId, name: c.name, position });
        if (c.items.length === 0) continue;
        await tx.insert(menuItems).values(
          c.items.map((i, idx) => ({
            id: randomUUID(),
            vendorId,
            categoryId,
            name: i.name,
            description: i.description,
            priceMinor: i.priceMinor,
            available: i.available,
            position: idx,
          })),
        );
      }
    });
  }

  private async deleteDraft(tx: Tx, vendorId: string, menuId: string): Promise<void> {
    const draft = await tx
      .select({ id: menus.id })
      .from(menus)
      .where(and(eq(menus.id, menuId), eq(menus.vendorId, vendorId), eq(menus.active, false)));
    if (draft.length === 0) return;
    const cats = tx
      .select({ id: menuCategories.id })
      .from(menuCategories)
      .where(eq(menuCategories.menuId, menuId));
    await tx.delete(menuItems).where(inArray(menuItems.categoryId, cats));
    await tx.delete(menuCategories).where(eq(menuCategories.menuId, menuId));
    await tx.delete(menus).where(eq(menus.id, menuId));
  }

  /** @inheritdoc */
  async activateMenu(vendorId: string, menuId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const target = await tx
        .select({ id: menus.id })
        .from(menus)
        .where(and(eq(menus.id, menuId), eq(menus.vendorId, vendorId)))
        .for('update');
      if (target.length === 0) return false;
      await tx
        .update(menus)
        .set({ active: false, updatedAt: sql`now()` })
        .where(eq(menus.vendorId, vendorId));
      await tx
        .update(menus)
        .set({ active: true, updatedAt: sql`now()` })
        .where(eq(menus.id, menuId));
      return true;
    });
  }
}
