import { describe, expect, it } from 'vitest';
import { ListMyVendors, type MyVendorsReader } from './list-my-vendors.query.js';

const V = '11111111-1111-4111-8111-111111111111';

describe('ListMyVendors', () => {
  it('returns only the memberships of the calling user', async () => {
    // Arrange
    const seen: string[] = [];
    const reader: MyVendorsReader = {
      vendorsOf: (userId) => {
        seen.push(userId);
        return Promise.resolve([
          { id: V, name: 'Mama Put', status: 'live', role: 'owner', branchIds: [] },
        ]);
      },
    };
    // Act
    const res = await new ListMyVendors(reader).execute('user-1');
    // Assert
    expect(seen).toEqual(['user-1']);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.role).toBe('owner');
  });

  it('returns an empty list for a user with no vendors', async () => {
    const res = await new ListMyVendors({ vendorsOf: () => Promise.resolve([]) }).execute('u');
    expect(res.items).toEqual([]);
  });
});
