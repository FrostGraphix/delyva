import type { LatLng } from '@delyva/utils';
import { sql } from 'drizzle-orm';
import type { Db } from '../../../shared/database/database.js';
import type { ZoneRef, ZoneRepository } from '../application/ports.js';

/** PostGIS adapter: `ST_Covers` against the GiST-indexed zone polygons (edges count as inside). */
export class PostgisZoneRepository implements ZoneRepository {
  /** @param db drizzle db */
  constructor(private readonly db: Db) {}

  /** @inheritdoc */
  async zoneIdsContaining(point: LatLng): Promise<string[]> {
    const result = await this.db.execute<{ id: string }>(sql`
      SELECT id FROM delivery_zones
      WHERE active AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326))`);
    return result.rows.map((r) => r.id);
  }

  /** @inheritdoc */
  async zonesContaining(point: LatLng): Promise<ZoneRef[]> {
    const result = await this.db.execute<{ id: string; city: string; name: string }>(sql`
      SELECT id, city, name FROM delivery_zones
      WHERE active AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326))`);
    return result.rows.map((r) => ({ id: r.id, city: r.city, name: r.name }));
  }
}
