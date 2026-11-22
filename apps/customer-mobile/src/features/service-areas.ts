/** A launch area customers can pick when location is off. */
export interface ServiceArea {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

/**
 * Lagos launch areas (centre points inside the delivery zones) for manual entry.
 * DEBT(geo): static area list — no Places key/autocomplete yet — replace with Google Places autocomplete + reverse geocoding.
 */
export const SERVICE_AREAS: readonly ServiceArea[] = [
  { id: 'yaba', name: 'Yaba', lat: 6.51, lng: 3.38 },
  { id: 'vi', name: 'Victoria Island', lat: 6.4281, lng: 3.4219 },
  { id: 'ikoyi', name: 'Ikoyi', lat: 6.452, lng: 3.437 },
  { id: 'lekki', name: 'Lekki', lat: 6.444, lng: 3.48 },
];

/** Nearest launch area to a point (for labelling a GPS fix). */
export function nearestArea(lat: number, lng: number): ServiceArea | null {
  let best: ServiceArea | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const a of SERVICE_AREAS) {
    const d = (a.lat - lat) ** 2 + (a.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}
