import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  geometry,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Vendors (restaurants and stores). Only `live` vendors are discoverable. */
export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    status: text('status').notNull().default('draft'),
    description: text('description'),
    ...timestamps,
  },
  (t) => [
    check(
      'vendors_category_chk',
      sql`${t.category} IN ('restaurant','grocery','pharmacy','bakery','shop')`,
    ),
    check('vendors_status_chk', sql`${t.status} IN ('draft','in_review','live','suspended')`),
    index('vendors_status_category_idx').on(t.status, t.category),
  ],
);

/** Users who may manage a vendor (identity user ids; no cross-context FK). */
export const vendorMembers = pgTable(
  'vendor_members',
  {
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.vendorId, t.userId] }),
    check('vendor_members_role_chk', sql`${t.role} IN ('owner','staff')`),
    index('vendor_members_user_idx').on(t.userId),
  ],
);

/** Vendor branches with a PostGIS location and the geo zone they serve. */
export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    name: text('name').notNull(),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
    zoneId: uuid('zone_id').notNull(),
    prepMinutes: integer('prep_minutes').notNull().default(15),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('branches_zone_idx').on(t.zoneId),
    index('branches_vendor_idx').on(t.vendorId),
    index('branches_location_gix').using('gist', t.location),
    check('branches_prep_chk', sql`${t.prepMinutes} BETWEEN 0 AND 240`),
  ],
);

/** Weekly opening intervals in Africa/Lagos wall-clock time (`closes_at <= opens_at` = overnight). */
export const branchOpeningHours = pgTable(
  'branch_opening_hours',
  {
    id: uuid('id').primaryKey(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    dayOfWeek: smallint('day_of_week').notNull(),
    opensAt: text('opens_at').notNull(),
    closesAt: text('closes_at').notNull(),
  },
  (t) => [
    index('branch_opening_hours_branch_idx').on(t.branchId),
    check('boh_day_chk', sql`${t.dayOfWeek} BETWEEN 0 AND 6`),
    check('boh_opens_chk', sql`${t.opensAt} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check('boh_closes_chk', sql`${t.closesAt} ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'`),
  ],
);

/** Vendor menus (one active menu per vendor in Phase 1). */
export const menus = pgTable('menus', {
  id: uuid('id').primaryKey(),
  vendorId: uuid('vendor_id')
    .notNull()
    .references(() => vendors.id),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

/** Menu categories (e.g. "Rice dishes", "Swallow"). `vendor_id` is denormalised for scoping. */
export const menuCategories = pgTable(
  'menu_categories',
  {
    id: uuid('id').primaryKey(),
    menuId: uuid('menu_id')
      .notNull()
      .references(() => menus.id),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('menu_categories_vendor_idx').on(t.vendorId)],
);

/** Menu items; prices are integer kobo (NGN minor units). */
export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => menuCategories.id),
    name: text('name').notNull(),
    description: text('description'),
    priceMinor: integer('price_minor').notNull(),
    currency: text('currency').notNull().default('NGN'),
    available: boolean('available').notNull().default(true),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('menu_items_vendor_idx').on(t.vendorId),
    index('menu_items_category_idx').on(t.categoryId),
    check('menu_items_price_chk', sql`${t.priceMinor} >= 0`),
    check('menu_items_currency_chk', sql`${t.currency} = 'NGN'`),
  ],
);

/** Modifier groups attached to an item, with selection bounds. */
export const modifierGroups = pgTable(
  'modifier_groups',
  {
    id: uuid('id').primaryKey(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    minSelect: integer('min_select').notNull(),
    maxSelect: integer('max_select').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('modifier_groups_item_idx').on(t.itemId),
    check(
      'modifier_groups_bounds_chk',
      sql`${t.minSelect} >= 0 AND ${t.maxSelect} >= 1 AND ${t.minSelect} <= ${t.maxSelect}`,
    ),
  ],
);

/** Modifier options with integer-kobo price deltas. */
export const modifierOptions = pgTable(
  'modifier_options',
  {
    id: uuid('id').primaryKey(),
    vendorId: uuid('vendor_id')
      .notNull()
      .references(() => vendors.id),
    groupId: uuid('group_id')
      .notNull()
      .references(() => modifierGroups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    priceDeltaMinor: integer('price_delta_minor').notNull().default(0),
    available: boolean('available').notNull().default(true),
    position: integer('position').notNull().default(0),
  },
  (t) => [
    index('modifier_options_group_idx').on(t.groupId),
    check('modifier_options_price_chk', sql`${t.priceDeltaMinor} >= 0`),
  ],
);
