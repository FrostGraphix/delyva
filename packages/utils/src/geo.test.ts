import { describe, expect, it } from 'vitest';
import { haversineMeters, isValidLatLng } from './geo.js';

describe('geo', () => {
  it('measures Ikeja to Victoria Island at about 20 km', () => {
    const d = haversineMeters({ lat: 6.6018, lng: 3.3515 }, { lat: 6.4281, lng: 3.4219 });
    expect(d).toBeGreaterThan(20_000);
    expect(d).toBeLessThan(21_000);
  });

  it('returns zero for the same point', () => {
    expect(haversineMeters({ lat: 6.5, lng: 3.3 }, { lat: 6.5, lng: 3.3 })).toBe(0);
  });

  it('validates coordinate ranges', () => {
    expect(isValidLatLng({ lat: 6.5, lng: 3.3 })).toBe(true);
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: Number.NaN })).toBe(false);
  });
});
