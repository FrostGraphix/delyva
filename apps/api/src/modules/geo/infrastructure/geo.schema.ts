import {
  boolean,
  customType,
  geometry,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** PostGIS polygon in WGS84. Read/written only through raw SQL (ST_GeomFromText / ST_Covers). */
const polygon4326 = customType<{ data: string; driverData: string }>({
  dataType: () => 'geometry(Polygon,4326)',
});

/**
 * Customer delivery addresses (geo context).
 * DEBT(security): line1/landmark stored in plaintext — field-level encryption for exact home
 * addresses is required by the security baseline — encrypt with a KMS data key before launch.
 */
export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    label: text('label').notNull(),
    line1: text('line1').notNull(),
    landmark: text('landmark'),
    location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('addresses_user_idx').on(t.userId, t.createdAt)],
);

/** Deliverable zones as PostGIS polygons. */
export const deliveryZones = pgTable(
  'delivery_zones',
  {
    id: uuid('id').primaryKey(),
    city: text('city').notNull(),
    name: text('name').notNull(),
    boundary: polygon4326('boundary').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('delivery_zones_boundary_gix').using('gist', t.boundary)],
);
