import { describe, expect, it } from 'vitest';
import { ROUTES } from '../openapi.js';
import {
  ArrivedAtVendorSchema,
  ManualAssignSchema,
  RiderAvailabilityRequestSchema,
  VehiclePlateSchema,
} from './dispatch.js';

describe('dispatch contracts', () => {
  it('validates plates, battery, handoff codes and manual-assign reasons', () => {
    expect(VehiclePlateSchema.safeParse('LAG-452-EV').success).toBe(true);
    expect(VehiclePlateSchema.safeParse('lag-452-ev').success).toBe(false);
    expect(RiderAvailabilityRequestSchema.safeParse({ batteryPct: 101 }).success).toBe(false);
    expect(ArrivedAtVendorSchema.safeParse({ pickupCode: '12a4' }).success).toBe(false);
    expect(ArrivedAtVendorSchema.safeParse({ pickupCode: '1234', extra: 1 }).success).toBe(false);
    const riderId = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';
    expect(ManualAssignSchema.safeParse({ riderId, reason: 'x' }).success).toBe(false);
  });

  it('registers idempotent rider write routes', () => {
    expect(ROUTES.acceptDispatchOffer).toMatchObject({ idempotent: true, auth: true });
    expect(ROUTES.tripDelivered.path).toBe('/v1/trips/{id}/delivered');
    expect(ROUTES.manuallyAssignOrder.path).toBe('/v1/admin/dispatch/orders/{orderId}/assign');
  });
});
