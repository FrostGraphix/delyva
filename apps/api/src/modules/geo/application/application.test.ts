import { describe, expect, it } from 'vitest';
import { LAGOS_ETA_POLICY } from '../domain/eta.js';
import { GeoError, MAX_ADDRESSES_PER_USER } from '../domain/geo-errors.js';
import { CreateAddress } from './create-address.use-case.js';
import { DeleteAddress } from './delete-address.use-case.js';
import { GeoService } from './geo.service.js';
import { ListAddresses } from './list-addresses.query.js';
import type { AddressChanges, AddressRecord, AddressRepository } from './ports.js';
import { UpdateAddress } from './update-address.use-case.js';

class FakeAddresses implements AddressRepository {
  rows: AddressRecord[] = [];
  listByUser(userId: string) {
    return Promise.resolve(this.rows.filter((r) => r.userId === userId));
  }
  countByUser(userId: string) {
    return Promise.resolve(this.rows.filter((r) => r.userId === userId).length);
  }
  create(a: AddressRecord) {
    this.rows.push(a);
    return Promise.resolve();
  }
  update(userId: string, id: string, c: AddressChanges) {
    const i = this.rows.findIndex((r) => r.id === id && r.userId === userId);
    const row = this.rows[i];
    if (!row) return Promise.resolve(null);
    const next = { ...row, ...c };
    this.rows[i] = next;
    return Promise.resolve(next);
  }
  delete(userId: string, id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.id === id && r.userId === userId));
    return Promise.resolve(this.rows.length < before);
  }
}

let n = 0;
const clock = { now: () => new Date('2026-11-20T10:00:00Z'), uuid: () => `id-${++n}` };
const input = { label: 'Home', line1: '12 Admiralty Way, Lekki', lat: 6.44, lng: 3.47 };

describe('address use cases', () => {
  it('creates and lists only the caller’s addresses', async () => {
    const repo = new FakeAddresses();
    const create = new CreateAddress({ addresses: repo, clock });
    const created = await create.execute('u1', { ...input, landmark: 'Opposite the mall' });
    await create.execute('u2', input);
    expect(created).toMatchObject({
      label: 'Home',
      landmark: 'Opposite the mall',
      createdAt: '2026-11-20T10:00:00.000Z',
    });
    const listed = await new ListAddresses(repo).execute('u1');
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('userId');
  });

  it('enforces the per-user address limit', async () => {
    const repo = new FakeAddresses();
    const create = new CreateAddress({ addresses: repo, clock });
    for (let i = 0; i < MAX_ADDRESSES_PER_USER; i++) await create.execute('u1', input);
    await expect(create.execute('u1', input)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('updates and deletes own addresses but 404s on foreign ones (IDOR)', async () => {
    const repo = new FakeAddresses();
    const a = await new CreateAddress({ addresses: repo, clock }).execute('u1', input);
    const update = new UpdateAddress(repo);
    await expect(update.execute('u1', a.id, { label: 'Office' })).resolves.toMatchObject({
      label: 'Office',
    });
    await expect(update.execute('u2', a.id, { label: 'Hacked' })).rejects.toBeInstanceOf(GeoError);
    const del = new DeleteAddress(repo);
    await expect(del.execute('u2', a.id)).rejects.toMatchObject({ code: 'not_found' });
    await expect(del.execute('u1', a.id)).resolves.toBeUndefined();
  });
});

describe('GeoService', () => {
  it('delegates zone lookup and builds delivery estimates', async () => {
    const geo = new GeoService({
      zones: { zoneIdsContaining: () => Promise.resolve(['z1']) },
      eta: { estimate: () => Promise.resolve({ distanceMeters: 3000, travelMinutes: 14 }) },
      policy: LAGOS_ETA_POLICY,
    });
    const a = { lat: 6.43, lng: 3.42 };
    expect(await geo.zonesContaining(a)).toEqual(['z1']);
    expect(await geo.travel(a, a)).toEqual({ distanceMeters: 3000, travelMinutes: 14 });
    expect(await geo.deliveryEstimate(a, a, 20)).toEqual({ distanceMeters: 3000, etaMinutes: 39 });
  });
});
