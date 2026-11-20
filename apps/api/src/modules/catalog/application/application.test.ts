import type { MenuItem, ModifierGroup, ModifierOption } from '@delyva/contracts';
import { describe, expect, it } from 'vitest';
import { CatalogError } from '../domain/catalog-errors.js';
import type { VendorMemberRole, VendorStatus } from '../domain/vendor.js';
import { ApproveVendor } from './approve-vendor.use-case.js';
import { CreateMenuItem } from './create-menu-item.use-case.js';
import { CreateModifierGroup } from './create-modifier-group.use-case.js';
import { DiscoverVendors } from './discover-vendors.query.js';
import { GetVendor } from './get-vendor.query.js';
import type {
  BranchCandidate,
  CatalogReadRepository,
  CatalogWriteRepository,
  GeoLookup,
  NewModifierGroup,
  VendorAggregate,
} from './ports.js';
import { ReplaceOpeningHours } from './replace-opening-hours.use-case.js';
import { SetItemAvailability } from './set-item-availability.use-case.js';
import { SetOptionAvailability } from './set-option-availability.use-case.js';
import { UpdateMenuItem } from './update-menu-item.use-case.js';

// Friday 2026-11-20 12:00 Lagos
const clock = { now: () => new Date('2026-11-20T11:00:00Z'), uuid: () => crypto.randomUUID() };
const allWeek = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek: d,
  opensAt: '08:00',
  closesAt: '22:00',
}));
const nightOnly = [{ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' }];

const branch = (over: Partial<BranchCandidate>): BranchCandidate => ({
  branchId: 'b1',
  vendorId: 'v1',
  vendorName: 'Jollof Junction',
  category: 'restaurant',
  zoneId: 'z1',
  location: { lat: 6.44, lng: 3.47 },
  prepMinutes: 20,
  hours: allWeek,
  ...over,
});

const aggregate = (status: VendorStatus): VendorAggregate => ({
  id: 'v1',
  name: 'Jollof Junction',
  category: 'restaurant',
  status,
  description: null,
  branches: [{ id: 'b1', name: 'Main', lat: 6.44, lng: 3.47, zoneId: 'z1', openingHours: allWeek }],
  menu: { categories: [] },
});

function reads(
  branches: BranchCandidate[],
  vendor: VendorAggregate | null = null,
): CatalogReadRepository {
  return {
    liveBranchesInZones: (zoneIds, category) =>
      Promise.resolve(
        branches.filter(
          (b) => zoneIds.includes(b.zoneId) && (!category || b.category === category),
        ),
      ),
    vendorAggregate: () => Promise.resolve(vendor),
  };
}

const geo = (zones: string[]): GeoLookup => ({
  zonesContaining: () => Promise.resolve(zones),
  deliveryEstimate: (from, _to, prep) =>
    Promise.resolve({
      distanceMeters: Math.round(from.lng * 1000),
      etaMinutes: prep + Math.round(from.lng * 10),
    }),
});

describe('DiscoverVendors', () => {
  const point = { lat: 6.44, lng: 3.47 };

  it('returns nothing when the point is outside every zone', async () => {
    const q = new DiscoverVendors({ catalog: reads([branch({})]), geo: geo([]), clock });
    expect(await q.execute(point)).toEqual([]);
  });

  it('keeps only open branches, one per vendor (fastest), sorted by ETA, fee placeholder null', async () => {
    const q = new DiscoverVendors({
      catalog: reads([
        branch({ branchId: 'b-slow', prepMinutes: 40 }),
        branch({ branchId: 'b-fast', prepMinutes: 5 }),
        branch({
          vendorId: 'v2',
          vendorName: 'Suya Republic',
          branchId: 'b-night',
          hours: nightOnly,
        }),
        branch({
          vendorId: 'v3',
          vendorName: 'FreshMart',
          category: 'grocery',
          branchId: 'b3',
          prepMinutes: 1,
        }),
        branch({ vendorId: 'v4', branchId: 'b4', zoneId: 'other-zone' }),
      ]),
      geo: geo(['z1']),
      clock,
    });
    const result = await q.execute(point);
    expect(result.map((r) => [r.id, r.branchId])).toEqual([
      ['v3', 'b3'],
      ['v1', 'b-fast'],
    ]);
    expect(result[0]).toMatchObject({ deliveryFee: null, distanceMeters: 3470, etaMinutes: 36 });
  });

  it('filters by category and breaks ETA ties by distance', async () => {
    const q = new DiscoverVendors({
      catalog: reads([
        branch({
          vendorId: 'v1',
          branchId: 'far',
          location: { lat: 6.44, lng: 3.5 },
          prepMinutes: 0,
        }),
        branch({
          vendorId: 'v1',
          branchId: 'near',
          location: { lat: 6.44, lng: 3.47 },
          prepMinutes: 1,
        }),
        branch({ vendorId: 'v3', category: 'grocery', branchId: 'g' }),
      ]),
      geo: {
        ...geo(['z1']),
        deliveryEstimate: (from) =>
          Promise.resolve({ distanceMeters: Math.round(from.lng * 1000), etaMinutes: 30 }),
      },
      clock,
    });
    const result = await q.execute({ ...point, category: 'restaurant' });
    expect(result.map((r) => r.branchId)).toEqual(['near']);
  });
});

describe('GetVendor', () => {
  it('returns live vendors with isOpenNow', async () => {
    const v = await new GetVendor({ catalog: reads([], aggregate('live')), clock }).execute('v1');
    expect(v.branches[0]?.isOpenNow).toBe(true);
  });

  it('hides missing and non-live vendors', async () => {
    await expect(
      new GetVendor({ catalog: reads([], null), clock }).execute('v1'),
    ).rejects.toBeInstanceOf(CatalogError);
    await expect(
      new GetVendor({ catalog: reads([], aggregate('draft')), clock }).execute('v1'),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

const item: MenuItem = {
  id: 'i1',
  categoryId: 'c1',
  name: 'Party jollof',
  description: null,
  price: { amountMinor: 350_000, currency: 'NGN' },
  available: true,
  modifierGroups: [],
};

class FakeWrites implements CatalogWriteRepository {
  members = new Map<string, VendorMemberRole>([
    ['v1:owner', 'owner'],
    ['v1:staff', 'staff'],
  ]);
  status: VendorStatus | null = 'in_review';
  casOk = true;
  lastGroup: NewModifierGroup | null = null;
  memberRole(vendorId: string, userId: string) {
    return Promise.resolve(this.members.get(`${vendorId}:${userId}`) ?? null);
  }
  createItem(vendorId: string) {
    return Promise.resolve(vendorId === 'v1' ? item : null);
  }
  updateItem(_v: string, itemId: string) {
    return Promise.resolve(itemId === 'i1' ? item : null);
  }
  setItemAvailability(_v: string, itemId: string, available: boolean) {
    return Promise.resolve(itemId === 'i1' ? { ...item, available } : null);
  }
  setOptionAvailability(
    _v: string,
    optionId: string,
    available: boolean,
  ): Promise<ModifierOption | null> {
    return Promise.resolve(
      optionId === 'o1'
        ? { id: 'o1', name: 'Beef', priceDelta: { amountMinor: 0, currency: 'NGN' }, available }
        : null,
    );
  }
  createModifierGroup(
    _v: string,
    itemId: string,
    g: NewModifierGroup,
  ): Promise<ModifierGroup | null> {
    this.lastGroup = g;
    if (itemId !== 'i1') return Promise.resolve(null);
    return Promise.resolve({
      id: g.id,
      name: g.name,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: { amountMinor: o.priceDeltaMinor, currency: 'NGN' as const },
        available: true,
      })),
    });
  }
  replaceHours(_v: string, branchId: string) {
    return Promise.resolve(branchId === 'b1');
  }
  vendorStatus() {
    return Promise.resolve(this.status);
  }
  changeStatus() {
    return Promise.resolve(this.casOk);
  }
}

const price = { amountMinor: 350_000, currency: 'NGN' as const };

describe('vendor menu use cases', () => {
  it('lets the owner create and update items', async () => {
    const w = new FakeWrites();
    await expect(
      new CreateMenuItem({ catalog: w, clock }).execute('owner', 'v1', {
        categoryId: 'c1',
        name: 'Jollof',
        price,
      }),
    ).resolves.toEqual(item);
    await expect(new UpdateMenuItem(w).execute('owner', 'v1', 'i1', { price })).resolves.toEqual(
      item,
    );
    await expect(
      new UpdateMenuItem(w).execute('owner', 'v1', 'missing', { name: 'x' }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('forbids non-members and staff menu edits (IDOR / RBAC re-check)', async () => {
    const w = new FakeWrites();
    const create = new CreateMenuItem({ catalog: w, clock });
    await expect(
      create.execute('stranger', 'v1', { categoryId: 'c1', name: 'x', price }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      create.execute('staff', 'v1', { categoryId: 'c1', name: 'x', price }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      create.execute('owner', 'v2', { categoryId: 'c1', name: 'x', price }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('reports a foreign category as not found', async () => {
    const w = new FakeWrites();
    w.members.set('v2:owner', 'owner');
    await expect(
      new CreateMenuItem({ catalog: w, clock }).execute('owner', 'v2', {
        categoryId: 'cX',
        name: 'x',
        price,
        description: 'd',
        available: false,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lets staff toggle item and option availability', async () => {
    const w = new FakeWrites();
    await expect(
      new SetItemAvailability(w).execute('staff', 'v1', 'i1', false),
    ).resolves.toMatchObject({ available: false });
    await expect(
      new SetItemAvailability(w).execute('staff', 'v1', 'zz', false),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      new SetOptionAvailability(w).execute('staff', 'v1', 'o1', false),
    ).resolves.toMatchObject({ available: false });
    await expect(
      new SetOptionAvailability(w).execute('stranger', 'v1', 'o1', false),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('creates modifier groups with validated bounds and kobo deltas', async () => {
    const w = new FakeWrites();
    const uc = new CreateModifierGroup({ catalog: w, clock });
    const body = {
      name: 'Protein',
      minSelect: 0,
      maxSelect: 1,
      options: [{ name: 'Beef', priceDelta: { amountMinor: 50_000, currency: 'NGN' as const } }],
    };
    const g = await uc.execute('owner', 'v1', 'i1', body);
    expect(g.options[0]?.priceDelta.amountMinor).toBe(50_000);
    await expect(uc.execute('owner', 'v1', 'i1', { ...body, maxSelect: 2 })).rejects.toMatchObject({
      code: 'validation_failed',
    });
    await expect(uc.execute('owner', 'v1', 'zz', body)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('replaces opening hours after overlap validation', async () => {
    const w = new FakeWrites();
    const uc = new ReplaceOpeningHours(w);
    await expect(uc.execute('owner', 'v1', 'b1', nightOnly)).resolves.toEqual(nightOnly);
    await expect(uc.execute('owner', 'v1', 'b9', nightOnly)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(uc.execute('staff', 'v1', 'b1', nightOnly)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      uc.execute('owner', 'v1', 'b1', [
        ...nightOnly,
        { dayOfWeek: 5, opensAt: '20:00', closesAt: '21:00' },
      ]),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});

describe('ApproveVendor', () => {
  it('moves an in-review vendor live and returns its detail', async () => {
    const w = new FakeWrites();
    const v = await new ApproveVendor({
      reads: reads([], aggregate('live')),
      writes: w,
      clock,
    }).execute('v1');
    expect(v.status).toBe('live');
  });

  it('rejects missing vendors, invalid transitions and lost races', async () => {
    const w = new FakeWrites();
    const uc = new ApproveVendor({ reads: reads([], null), writes: w, clock });
    await expect(uc.execute('v1')).rejects.toMatchObject({ code: 'not_found' });
    w.casOk = false;
    await expect(uc.execute('v1')).rejects.toMatchObject({ code: 'conflict' });
    w.status = 'draft';
    await expect(uc.execute('v1')).rejects.toMatchObject({ code: 'conflict' });
    w.status = null;
    await expect(uc.execute('v1')).rejects.toMatchObject({ code: 'not_found' });
  });
});
