import { describe, expect, it } from 'vitest';
import {
  CreateAddressSchema,
  CreateMenuItemSchema,
  CreateModifierGroupSchema,
  DiscoverVendorsQuerySchema,
  OpeningHoursEntrySchema,
  UpdateAddressSchema,
  UpdateMenuItemSchema,
} from '../index.js';
import { buildOpenApiDocument } from '../openapi.js';

const uuid = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';

describe('catalog contracts', () => {
  it('coerces discovery query strings and rejects out-of-range coordinates', () => {
    expect(DiscoverVendorsQuerySchema.parse({ lat: '6.43', lng: '3.42' })).toEqual({
      lat: 6.43,
      lng: 3.42,
    });
    expect(DiscoverVendorsQuerySchema.safeParse({ lat: '91', lng: '3' }).success).toBe(false);
    expect(
      DiscoverVendorsQuerySchema.safeParse({ lat: '6', lng: '3', category: 'casino' }).success,
    ).toBe(false);
  });

  it('rejects float kobo prices and unknown fields', () => {
    const base = { categoryId: uuid, name: 'Jollof rice' };
    expect(
      CreateMenuItemSchema.safeParse({ ...base, price: { amountMinor: 250000, currency: 'NGN' } })
        .success,
    ).toBe(true);
    expect(
      CreateMenuItemSchema.safeParse({ ...base, price: { amountMinor: 2500.5, currency: 'NGN' } })
        .success,
    ).toBe(false);
    expect(
      CreateMenuItemSchema.safeParse({
        ...base,
        price: { amountMinor: 1, currency: 'NGN' },
        vendorId: uuid,
      }).success,
    ).toBe(false);
  });

  it('requires at least one field on updates', () => {
    expect(UpdateMenuItemSchema.safeParse({}).success).toBe(false);
    expect(UpdateMenuItemSchema.safeParse({ name: 'Suya' }).success).toBe(true);
    expect(UpdateAddressSchema.safeParse({}).success).toBe(false);
    expect(UpdateAddressSchema.safeParse({ lat: 6.4 }).success).toBe(false);
    expect(UpdateAddressSchema.safeParse({ lat: 6.4, lng: 3.4 }).success).toBe(true);
  });

  it('validates modifier group bounds', () => {
    const option = { name: 'Extra beef', priceDelta: { amountMinor: 50000, currency: 'NGN' } };
    expect(
      CreateModifierGroupSchema.safeParse({
        name: 'Protein',
        minSelect: 2,
        maxSelect: 1,
        options: [option, option],
      }).success,
    ).toBe(false);
    expect(
      CreateModifierGroupSchema.safeParse({
        name: 'Protein',
        minSelect: 0,
        maxSelect: 2,
        options: [option],
      }).success,
    ).toBe(false);
  });

  it('accepts overnight hours and 24:00 closing but not identical times', () => {
    expect(
      OpeningHoursEntrySchema.safeParse({ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' })
        .success,
    ).toBe(true);
    expect(
      OpeningHoursEntrySchema.safeParse({ dayOfWeek: 5, opensAt: '08:00', closesAt: '24:00' })
        .success,
    ).toBe(true);
    expect(
      OpeningHoursEntrySchema.safeParse({ dayOfWeek: 5, opensAt: '08:00', closesAt: '08:00' })
        .success,
    ).toBe(false);
    expect(
      OpeningHoursEntrySchema.safeParse({ dayOfWeek: 7, opensAt: '08:00', closesAt: '09:00' })
        .success,
    ).toBe(false);
  });

  it('accepts a valid address', () => {
    expect(
      CreateAddressSchema.safeParse({
        label: 'Home',
        line1: '12 Admiralty Way',
        lat: 6.4,
        lng: 3.4,
      }).success,
    ).toBe(true);
  });
});

interface Op {
  security?: unknown[];
  parameters?: { name: string; in: string; required: boolean }[];
}

describe('OpenAPI for catalog and geo', () => {
  const doc = buildOpenApiDocument('0.0.0') as { paths: Record<string, Record<string, Op>> };

  it('documents query parameters for discovery', () => {
    const params = doc.paths['/v1/vendors']?.get?.parameters ?? [];
    expect(params.map((p) => [p.name, p.in, p.required])).toEqual([
      ['lat', 'query', true],
      ['lng', 'query', true],
      ['category', 'query', false],
    ]);
  });

  it('documents path params, bearer auth and idempotency on vendor writes', () => {
    const op = doc.paths['/v1/vendors/{vendorId}/items/{itemId}']?.patch;
    expect(op?.security).toEqual([{ bearerAuth: [] }]);
    expect(op?.parameters?.map((p) => p.name)).toEqual(['vendorId', 'itemId', 'Idempotency-Key']);
    expect(doc.paths['/v1/addresses/{addressId}']?.delete).toBeDefined();
  });
});
