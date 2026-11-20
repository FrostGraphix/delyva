import type { MenuItem } from '@delyva/contracts';
import { describe, expect, it } from 'vitest';
import { CatalogService } from './catalog.service.js';
import type { BranchSummary, OrderingCatalogReads } from './ports.js';

const ngn = (amountMinor: number) => ({ amountMinor, currency: 'NGN' as const });
const ID = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

const shawarma: MenuItem = {
  id: ID(1),
  categoryId: ID(9),
  name: 'Chicken shawarma',
  description: null,
  price: ngn(400_000),
  available: true,
  modifierGroups: [
    {
      id: ID(2),
      name: 'Extras',
      minSelect: 0,
      maxSelect: 1,
      options: [
        { id: ID(3), name: 'Cheese', priceDelta: ngn(50_000), available: true },
        { id: ID(4), name: 'Sausage', priceDelta: ngn(70_000), available: false },
      ],
    },
  ],
};

const branch: BranchSummary = {
  branchId: ID(10),
  branchName: 'Main',
  vendorId: ID(11),
  vendorName: 'Shawarma Hub',
  vendorStatus: 'live',
  active: true,
  zoneId: ID(12),
  location: { lat: 6.45, lng: 3.43 },
  prepMinutes: 15,
  hours: [{ dayOfWeek: 5, opensAt: '00:00', closesAt: '24:00' }],
};

function service(items: MenuItem[], summary: BranchSummary | null = branch) {
  const reads: OrderingCatalogReads = {
    branchSummary: () => Promise.resolve(summary),
    vendorItems: () => Promise.resolve(items),
  };
  return new CatalogService({
    reads,
    members: { memberRole: (_v, u) => Promise.resolve(u === 'owner' ? 'owner' : null) },
    // 2026-11-20 is a Friday (dayOfWeek 5) in Lagos.
    clock: { now: () => new Date('2026-11-20T10:00:00Z'), uuid: () => 'x' },
  });
}

describe('CatalogService (ordering-facing)', () => {
  it('reports whether a branch accepts orders now', async () => {
    expect(await service([]).branch(branch.branchId)).toMatchObject({ acceptingOrders: true });
    const closed = { ...branch, hours: [] };
    expect(await service([], closed).branch(branch.branchId)).toMatchObject({
      acceptingOrders: false,
    });
    const suspended = { ...branch, vendorStatus: 'suspended' as const };
    expect((await service([], suspended).branch('b'))?.acceptingOrders).toBe(false);
    expect(await service([], null).branch('b')).toBeNull();
  });

  it('prices selections from the catalog and flags problems', async () => {
    const off = { ...shawarma, id: ID(5), available: false };
    const [ok, bad, unavailable, missing] = await service([shawarma, off]).priceSelections(
      branch.vendorId,
      [
        { itemId: ID(1), quantity: 2, optionIds: [ID(3)] },
        { itemId: ID(1), quantity: 1, optionIds: [ID(4)] },
        { itemId: ID(5), quantity: 1, optionIds: [] },
        { itemId: ID(6), quantity: 1, optionIds: [] },
      ],
    );
    expect(ok).toMatchObject({
      unitPriceMinor: 400_000,
      options: [{ id: ID(3), name: 'Cheese', priceDeltaMinor: 50_000 }],
      problem: null,
    });
    expect(bad?.problem).toContain('unavailable');
    expect(unavailable?.problem).toBe('Item is unavailable');
    expect(missing?.problem).toBe('Item no longer exists');
  });

  it('looks up vendor membership', async () => {
    expect(await service([]).memberRole('v', 'owner')).toBe('owner');
    expect(await service([]).memberRole('v', 'someone')).toBeNull();
  });
});
