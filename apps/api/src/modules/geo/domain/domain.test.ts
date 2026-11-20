import { describe, expect, it } from 'vitest';
import { deliveryEtaMinutes, estimateTravel, LAGOS_ETA_POLICY } from './eta.js';
import { type DeliveryZone, pointInRing, zonesContaining } from './zone.js';

const box = (minLat: number, minLng: number, maxLat: number, maxLng: number) => [
  { lat: minLat, lng: minLng },
  { lat: minLat, lng: maxLng },
  { lat: maxLat, lng: maxLng },
  { lat: maxLat, lng: minLng },
];

const zones: DeliveryZone[] = [
  { id: 'vi', name: 'Victoria Island', ring: box(6.415, 3.395, 6.44, 3.445) },
  { id: 'yaba', name: 'Yaba', ring: box(6.495, 3.365, 6.525, 3.395) },
];

describe('zone check', () => {
  it('finds the zone containing a point', () => {
    expect(zonesContaining(zones, { lat: 6.428, lng: 3.42 })).toEqual(['vi']);
    expect(zonesContaining(zones, { lat: 6.51, lng: 3.38 })).toEqual(['yaba']);
  });

  it('returns nothing for out-of-zone points (e.g. Ikeja)', () => {
    expect(zonesContaining(zones, { lat: 6.6018, lng: 3.3515 })).toEqual([]);
  });

  it('treats edges as inside and rejects degenerate rings', () => {
    expect(pointInRing({ lat: 6.415, lng: 3.42 }, box(6.415, 3.395, 6.44, 3.445))).toBe(true);
    expect(
      pointInRing({ lat: 6.42, lng: 3.4 }, [
        { lat: 6, lng: 3 },
        { lat: 7, lng: 4 },
      ]),
    ).toBe(false);
  });

  it('handles concave polygons', () => {
    const ell = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 1, lng: 2 },
      { lat: 1, lng: 1 },
      { lat: 2, lng: 1 },
      { lat: 2, lng: 0 },
    ];
    expect(pointInRing({ lat: 0.5, lng: 1.5 }, ell)).toBe(true);
    expect(pointInRing({ lat: 1.5, lng: 1.5 }, ell)).toBe(false);
  });
});

describe('ETA heuristic', () => {
  it('applies road factor and speed, rounding up', () => {
    // 3 km straight → 4.2 km road at 18 km/h = 14 min
    expect(estimateTravel(3_000, LAGOS_ETA_POLICY)).toEqual({
      distanceMeters: 3000,
      travelMinutes: 14,
    });
    expect(estimateTravel(0, LAGOS_ETA_POLICY).travelMinutes).toBe(1);
  });

  it('rejects invalid distances', () => {
    expect(() => estimateTravel(-1, LAGOS_ETA_POLICY)).toThrow(RangeError);
    expect(() => estimateTravel(Number.NaN, LAGOS_ETA_POLICY)).toThrow(RangeError);
  });

  it('adds prep and handling time', () => {
    expect(deliveryEtaMinutes(20, 14, LAGOS_ETA_POLICY)).toBe(39);
    expect(deliveryEtaMinutes(-5, 14, LAGOS_ETA_POLICY)).toBe(19);
  });
});
