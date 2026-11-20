import type { LatLng } from '@delyva/utils';
import { deliveryEtaMinutes, type EtaPolicy, type TravelEstimate } from '../domain/eta.js';
import type {
  AddressRecord,
  AddressRepository,
  EtaProvider,
  ZoneRef,
  ZoneRepository,
} from './ports.js';

/** Delivery estimate from a vendor branch to a customer point. */
export interface DeliveryEstimate {
  readonly distanceMeters: number;
  readonly etaMinutes: number;
}

/**
 * Public interface of the geo context for other contexts (catalog, pricing, dispatch, ordering).
 * Callers depend on this class only, never on geo tables.
 */
export class GeoService {
  /** @param deps zone + address repositories, ETA provider and ETA policy */
  constructor(
    private readonly deps: {
      zones: ZoneRepository;
      addresses: Pick<AddressRepository, 'findForUser'>;
      eta: EtaProvider;
      policy: EtaPolicy;
    },
  ) {}

  /** Ids of active delivery zones that cover the point. */
  zonesContaining(point: LatLng): Promise<string[]> {
    return this.deps.zones.zoneIdsContaining(point);
  }

  /** Active delivery zones (id, city, name) that cover the point. */
  zonesAt(point: LatLng): Promise<ZoneRef[]> {
    return this.deps.zones.zonesContaining(point);
  }

  /** One of the user's saved addresses (null for unknown or foreign ids). PII: never log it. */
  addressOf(userId: string, addressId: string): Promise<AddressRecord | null> {
    return this.deps.addresses.findForUser(userId, addressId);
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
