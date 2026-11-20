import type { DiscoverVendorsQuery, VendorSummary } from '@delyva/contracts';
import { isOpenAt } from '../domain/opening-hours.js';
import type { CatalogReadRepository, Clock, GeoLookup } from './ports.js';

/** Maximum vendors returned by one discovery call. */
export const DISCOVERY_LIMIT = 50;

/**
 * Query: vendors that are live, open now (Lagos time) and have a branch in a delivery zone that
 * covers the customer's point. One entry per vendor (its fastest branch), fastest ETA first.
 */
export class DiscoverVendors {
  /** @param deps read repository, geo lookup and clock */
  constructor(
    private readonly deps: { catalog: CatalogReadRepository; geo: GeoLookup; clock: Clock },
  ) {}

  /** Executes the query. */
  async execute(input: DiscoverVendorsQuery): Promise<VendorSummary[]> {
    const { catalog, geo, clock } = this.deps;
    const point = { lat: input.lat, lng: input.lng };
    const zoneIds = await geo.zonesContaining(point);
    if (zoneIds.length === 0) return [];
    const now = clock.now();
    const open = (await catalog.liveBranchesInZones(zoneIds, input.category)).filter((b) =>
      isOpenAt(b.hours, now),
    );
    const summaries = await Promise.all(
      open.map(async (b): Promise<VendorSummary> => {
        const est = await geo.deliveryEstimate(b.location, point, b.prepMinutes);
        return {
          id: b.vendorId,
          name: b.vendorName,
          category: b.category,
          branchId: b.branchId,
          zoneId: b.zoneId,
          distanceMeters: est.distanceMeters,
          etaMinutes: est.etaMinutes,
          // DEBT(pricing): fee placeholder — pricing context not built yet — call PricingService.quote.
          deliveryFee: null,
        };
      }),
    );
    return fastestPerVendor(summaries).slice(0, DISCOVERY_LIMIT);
  }
}

function fastestPerVendor(items: readonly VendorSummary[]): VendorSummary[] {
  const best = new Map<string, VendorSummary>();
  for (const s of items) {
    const current = best.get(s.id);
    if (!current || rank(s, current) < 0) best.set(s.id, s);
  }
  return [...best.values()].sort(rank);
}

function rank(a: VendorSummary, b: VendorSummary): number {
  return a.etaMinutes - b.etaMinutes || a.distanceMeters - b.distanceMeters;
}
