import { describe, expect, it } from 'vitest';
import { checkFixFreshness, isOpsStaff, isRider, partitionFixes } from './location-policy.js';

const now = 1_800_000_000_000;
const fix = (ts: number) => ({ lat: 6.5, lng: 3.4, heading: null, ts });

describe('location policy', () => {
  it('rejects stale and future fixes', () => {
    expect(checkFixFreshness(fix(now - 6 * 60_000), now)).toBe('stale');
    expect(checkFixFreshness(fix(now + 60_000), now)).toBe('future');
    expect(checkFixFreshness(fix(now - 1_000), now)).toBeNull();
  });

  it('partitions and sorts fresh fixes by timestamp', () => {
    const r = partitionFixes([fix(now - 1_000), fix(now - 3_000), fix(now - 999_999)], now);
    expect(r.rejected).toBe(1);
    expect(r.fresh.map((f) => f.ts)).toEqual([now - 3_000, now - 1_000]);
  });

  it('classifies roles', () => {
    expect(isOpsStaff(['ops'])).toBe(true);
    expect(isOpsStaff(['customer', 'rider'])).toBe(false);
    expect(isRider(['rider'])).toBe(true);
  });
});
