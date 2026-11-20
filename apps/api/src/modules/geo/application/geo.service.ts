import type { LatLng } from '@delyva/utils';
import { deliveryEtaMinutes, type EtaPolicy, type TravelEstimate } from '../domain/eta.js';
import type { EtaProvider, ZoneRepository } from './ports.js';

/** Delivery estimate from a vendor branch to a customer point. */
export interface DeliveryEstimate {
  readonly distanceMeters: number;
  readonly etaMinutes: number;
}

/**
 * Public interface of the geo context for other contexts (catalog, pricing, dispatch).
 * Callers depend on this class only, never on geo tables.
 */
export class GeoService {
  /** @param deps zone repository, ETA provider and ETA policy */
  constructor(
    private readonly deps: { zones: ZoneRepository; eta: EtaProvider; policy: EtaPolicy },
  ) {}

  /** Ids of active delivery zones that cover the point. */
  zonesContaining(point: LatLng): Promise<string[]> {
    return this.deps.zones.zoneIdsContaining(point);
  }

  /** Distance and travel time between two points. */
  travel(from: LatLng, to: LatLng): Promise<TravelEstimate> {
    return this.deps.eta.estimate(from, to);
  }

  /** Customer-facing estimate: prep + travel + handling, with straight-line distance. */
  async deliveryEstimate(from: LatLng, to: LatLng, prepMinutes: number): Promise<DeliveryEstimate> {
    const t = await this.deps.eta.estimate(from, to);
    return {
      distanceMeters: t.distanceMeters,
      etaMinutes: deliveryEtaMinutes(prepMinutes, t.travelMinutes, this.deps.policy),
    };
  }
}
