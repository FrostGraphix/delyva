import type { LatLng } from '@delyva/utils';

/** A delivery zone: a simple polygon ring (first point need not repeat at the end). */
export interface DeliveryZone {
  readonly id: string;
  readonly name: string;
  readonly ring: readonly LatLng[];
}

/**
 * Ray-casting point-in-polygon on a planar lat/lng ring (accurate at city scale). Points exactly
 * on an edge are treated as inside, matching PostGIS `ST_Covers` used in production queries.
 */
export function pointInRing(point: LatLng, ring: readonly LatLng[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    if (onSegment(point, a, b)) return true;
    const crosses =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lng < ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (crosses) inside = !inside;
  }
  return inside;
}

function onSegment(p: LatLng, a: LatLng, b: LatLng): boolean {
  const cross = (p.lat - a.lat) * (b.lng - a.lng) - (p.lng - a.lng) * (b.lat - a.lat);
  if (Math.abs(cross) > 1e-12) return false;
  return (
    p.lat >= Math.min(a.lat, b.lat) &&
    p.lat <= Math.max(a.lat, b.lat) &&
    p.lng >= Math.min(a.lng, b.lng) &&
    p.lng <= Math.max(a.lng, b.lng)
  );
}

/** Ids of the zones that contain the point. */
export function zonesContaining(zones: readonly DeliveryZone[], point: LatLng): string[] {
  return zones.filter((z) => pointInRing(point, z.ring)).map((z) => z.id);
}
