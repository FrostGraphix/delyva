import { haversineMeters, type LatLng } from '@delyva/utils';
import type { EtaProvider } from '../application/ports.js';
import { estimateTravel, type EtaPolicy, type TravelEstimate } from '../domain/eta.js';

/** Offline ETA: haversine distance × road factor at an average Lagos rider speed. */
export class HaversineEtaProvider implements EtaProvider {
  /** @param policy ETA tunables */
  constructor(private readonly policy: EtaPolicy) {}

  /** @inheritdoc */
  estimate(from: LatLng, to: LatLng): Promise<TravelEstimate> {
    return Promise.resolve(estimateTravel(haversineMeters(from, to), this.policy));
  }
}

interface DistanceMatrixResponse {
  status?: string;
  rows?: {
    elements?: {
      status?: string;
      distance?: { value?: number };
      duration_in_traffic?: { value?: number };
      duration?: { value?: number };
    }[];
  }[];
}

/**
 * Google Distance Matrix adapter (STUB — not wired by default, not exercised by tests).
 * Selected with `ETA_PROVIDER=google`; reads the key from env. Falls back to the haversine provider
 * on any failure so discovery never breaks on a Maps outage.
 * DEBT(geo): no retry/circuit breaker and one HTTP call per vendor — batch origins per request and
 * add a breaker + Redis cache before enabling in production.
 */
export class GoogleDistanceMatrixEtaProvider implements EtaProvider {
  /** @param config API key, timeout and fallback provider */
  constructor(
    private readonly config: { apiKey: string; timeoutMs: number; fallback: EtaProvider },
  ) {}

  /** @inheritdoc */
  async estimate(from: LatLng, to: LatLng): Promise<TravelEstimate> {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
      url.searchParams.set('origins', `${from.lat},${from.lng}`);
      url.searchParams.set('destinations', `${to.lat},${to.lng}`);
      url.searchParams.set('mode', 'driving');
      url.searchParams.set('departure_time', 'now');
      url.searchParams.set('key', this.config.apiKey);
      const res = await fetch(url, { signal: AbortSignal.timeout(this.config.timeoutMs) });
      const body = (await res.json()) as DistanceMatrixResponse;
      const el = body.rows?.[0]?.elements?.[0];
      const seconds = el?.duration_in_traffic?.value ?? el?.duration?.value;
      const meters = el?.distance?.value;
      if (
        body.status !== 'OK' ||
        el?.status !== 'OK' ||
        seconds === undefined ||
        meters === undefined
      ) {
        return await this.config.fallback.estimate(from, to);
      }
      return { distanceMeters: meters, travelMinutes: Math.max(1, Math.ceil(seconds / 60)) };
    } catch {
      return this.config.fallback.estimate(from, to);
    }
  }
}
