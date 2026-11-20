import type {
  MenuCategory,
  MenuItem,
  ModifierGroup,
  VendorCategory,
  VendorStatus,
} from '@delyva/contracts';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import type {
  BranchCandidate,
  BranchSummary,
  CatalogReadRepository,
  OrderingCatalogReads,
  VendorAggregate,
} from '../application/ports.js';
import type { WeeklyInterval } from '../domain/opening-hours.js';
import {
  branches,
  branchOpeningHours,
  menuCategories,
  menuItems,
  menus,
  modifierGroups,
  modifierOptions,
  vendors,
} from './catalog.schema.js';

const ngn = (amountMinor: number) => ({ amountMinor, currency: 'NGN' as const });

/** Drizzle/PostGIS read model for discovery and vendor menus. */
export class DrizzleCatalogReadRepository implements CatalogReadRepository, OrderingCatalogReads {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async liveBranchesInZones(
    zoneIds: readonly string[],
    category?: VendorCategory,
  ): Promise<BranchCandidate[]> {
    if (zoneIds.length === 0) return [];
    const rows = await this.db
      .select({
        branchId: branches.id,
        vendorId: vendors.id,
        vendorName: vendors.name,
        category: vendors.category,
        zoneId: branches.zoneId,
        lat: sql<number>`ST_Y(${branches.location})`.mapWith(Number),
        lng: sql<number>`ST_X(${branches.location})`.mapWith(Number),
        prepMinutes: branches.prepMinutes,
      })
      .from(branches)
      .innerJoin(vendors, eq(vendors.id, branches.vendorId))
      .where(
        and(
          eq(vendors.status, 'live'),
          eq(branches.active, true),
          inArray(branches.zoneId, [...zoneIds]),
          category ? eq(vendors.category, category) : undefined,
        ),
      );
    const hours = await this.hoursFor(rows.map((r) => r.branchId));
    return rows.map((r) => ({
      branchId: r.branchId,
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      category: r.category as VendorCategory,
      zoneId: r.zoneId,
      location: { lat: r.lat, lng: r.lng },
      prepMinutes: r.prepMinutes,
      hours: hours.get(r.branchId) ?? [],
    }));
  }

  /** @inheritdoc */
  async vendorAggregate(vendorId: string): Promise<VendorAggregate | null> {
    const [vendor] = await this.db.select().from(vendors).where(eq(vendors.id, vendorId));
    if (!vendor) return null;
    const branchRows = await this.db
      .select({
        id: branches.id,
        name: branches.name,
        zoneId: branches.zoneId,
        lat: sql<number>`ST_Y(${branches.location})`.mapWith(Number),
        lng: sql<number>`ST_X(${branches.location})`.mapWith(Number),
      })
      .from(branches)
      .where(and(eq(branches.vendorId, vendorId), eq(branches.active, true)))
      .orderBy(asc(branches.name));
    const hours = await this.hoursFor(branchRows.map((b) => b.id));
    return {
      id: vendor.id,
      name: vendor.name,
      category: vendor.category as VendorCategory,
      status: vendor.status as VendorStatus,
      description: vendor.description,
      branches: branchRows.map((b) => ({
        id: b.id,
        name: b.name,
        zoneId: b.zoneId,
        lat: b.lat,
        lng: b.lng,
        openingHours: hours.get(b.id) ?? [],
      })),
      menu: { categories: await this.menuOf(vendorId) },
    };
  }

  /** @inheritdoc */
  async branchSummary(branchId: string): Promise<BranchSummary | null> {
    const [r] = await this.db
      .select({
        branchId: branches.id,
        branchName: branches.name,
        vendorId: vendors.id,
        vendorName: vendors.name,
        vendorStatus: vendors.status,
        active: branches.active,
        zoneId: branches.zoneId,
        lat: sql<number>`ST_Y(${branches.location})`.mapWith(Number),
        lng: sql<number>`ST_X(${branches.location})`.mapWith(Number),
        prepMinutes: branches.prepMinutes,
      })
      .from(branches)
      .innerJoin(vendors, eq(vendors.id, branches.vendorId))
      .where(eq(branches.id, branchId));
    if (!r) return null;
    const hours = await this.hoursFor([r.branchId]);
    return {
      branchId: r.branchId,
      branchName: r.branchName,
      vendorId: r.vendorId,
      vendorName: r.vendorName,
      vendorStatus: r.vendorStatus as VendorStatus,
      active: r.active,
      zoneId: r.zoneId,
      location: { lat: r.lat, lng: r.lng },
      prepMinutes: r.prepMinutes,
      hours: hours.get(r.branchId) ?? [],
    };
  }

  /** @inheritdoc */
  vendorItems(vendorId: string): Promise<MenuItem[]> {
    return loadItems(this.db, vendorId);
  }

  private async hoursFor(branchIds: string[]): Promise<Map<string, WeeklyInterval[]>> {
    const map = new Map<string, WeeklyInterval[]>();
    if (branchIds.length === 0) return map;
    const rows = await this.db
      .select()
      .from(branchOpeningHours)
      .where(inArray(branchOpeningHours.branchId, branchIds))
      .orderBy(asc(branchOpeningHours.dayOfWeek), asc(branchOpeningHours.opensAt));
    for (const r of rows) {
      const list = map.get(r.branchId) ?? [];
      list.push({ dayOfWeek: r.dayOfWeek, opensAt: r.opensAt, closesAt: r.closesAt });
      map.set(r.branchId, list);
    }
    return map;
  }

  private async menuOf(vendorId: string): Promise<MenuCategory[]> {
    const cats = await this.db
      .select({
        id: menuCategories.id,
        name: menuCategories.name,
        position: menuCategories.position,
      })
      .from(menuCategories)
      .innerJoin(menus, and(eq(menus.id, menuCategories.menuId), eq(menus.active, true)))
      .where(eq(menuCategories.vendorId, vendorId))
      .orderBy(asc(menuCategories.position));
    const items = await loadItems(this.db, vendorId);
    return cats.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id) }));
  }
}

/** Loads all items of a vendor (optionally one item) with modifier groups and options. */
export async function loadItems(db: Db, vendorId: string, itemId?: string): Promise<MenuItem[]> {
  const itemRows = await db
    .select()
    .from(menuItems)
    .where(and(eq(menuItems.vendorId, vendorId), itemId ? eq(menuItems.id, itemId) : undefined))
    .orderBy(asc(menuItems.position), asc(menuItems.name));
  if (itemRows.length === 0) return [];
  const groups = await loadGroups(
    db,
    itemRows.map((i) => i.id),
  );
  return itemRows.map((i) => ({
    id: i.id,
    categoryId: i.categoryId,
    name: i.name,
    description: i.description,
    price: ngn(i.priceMinor),
    available: i.available,
    modifierGroups: groups.filter((g) => g.itemId === i.id).map(({ itemId: _, ...g }) => g),
  }));
}

async function loadGroups(
  db: Db,
  itemIds: string[],
): Promise<(ModifierGroup & { itemId: string })[]> {
  const groupRows = await db
    .select()
    .from(modifierGroups)
    .where(inArray(modifierGroups.itemId, itemIds))
    .orderBy(asc(modifierGroups.position));
  if (groupRows.length === 0) return [];
  const optionRows = await db
    .select()
    .from(modifierOptions)
    .where(
      inArray(
        modifierOptions.groupId,
        groupRows.map((g) => g.id),
      ),
    )
    .orderBy(asc(modifierOptions.position));
  return groupRows.map((g) => ({
    id: g.id,
    itemId: g.itemId,
    name: g.name,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    options: optionRows
      .filter((o) => o.groupId === g.id)
      .map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: ngn(o.priceDeltaMinor),
        available: o.available,
      })),
  }));
}
