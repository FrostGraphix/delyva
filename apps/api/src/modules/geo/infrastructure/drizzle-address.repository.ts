import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import type { AddressChanges, AddressRecord, AddressRepository } from '../application/ports.js';
import { addresses } from './geo.schema.js';

const columns = {
  id: addresses.id,
  userId: addresses.userId,
  label: addresses.label,
  line1: addresses.line1,
  landmark: addresses.landmark,
  location: addresses.location,
  createdAt: addresses.createdAt,
};

/** WGS84 point expression (SRID 4326 matches the column type). */
export const pointSql = (lat: number, lng: number) =>
  sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;

type Row = { location: { x: number; y: number } } & Omit<AddressRecord, 'lat' | 'lng'>;

const toRecord = ({ location, ...rest }: Row): AddressRecord => ({
  ...rest,
  lat: location.y,
  lng: location.x,
});

/** Drizzle/PostGIS adapter for {@link AddressRepository}; every query is scoped by `user_id`. */
export class DrizzleAddressRepository implements AddressRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async listByUser(userId: string): Promise<AddressRecord[]> {
    const rows = await this.db
      .select(columns)
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(desc(addresses.createdAt));
    return rows.map(toRecord);
  }

  /** @inheritdoc */
  async countByUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(addresses)
      .where(eq(addresses.userId, userId));
    return row?.n ?? 0;
  }

  /** @inheritdoc */
  async create(a: AddressRecord): Promise<void> {
    await this.db.insert(addresses).values({
      id: a.id,
      userId: a.userId,
      label: a.label,
      line1: a.line1,
      landmark: a.landmark,
      location: pointSql(a.lat, a.lng),
      createdAt: a.createdAt,
    });
  }

  /** @inheritdoc */
  async update(userId: string, id: string, c: AddressChanges): Promise<AddressRecord | null> {
    const rows = await this.db
      .update(addresses)
      .set({
        ...(c.label !== undefined ? { label: c.label } : {}),
        ...(c.line1 !== undefined ? { line1: c.line1 } : {}),
        ...(c.landmark !== undefined ? { landmark: c.landmark } : {}),
        ...(c.lat !== undefined && c.lng !== undefined ? { location: pointSql(c.lat, c.lng) } : {}),
        updatedAt: sql`now()`,
      })
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning(columns);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  /** @inheritdoc */
  async delete(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
      .returning({ id: addresses.id });
    return rows.length > 0;
  }
}
