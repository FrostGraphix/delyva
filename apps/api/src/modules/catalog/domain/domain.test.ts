import { describe, expect, it } from 'vitest';
import { CatalogError } from './catalog-errors.js';
import {
  assertValidModifierGroup,
  type ModifierGroupRule,
  validateSelection,
} from './modifiers.js';
import { assertValidWeeklyHours, isOpenAt, lagosWeekMinute, toMinutes } from './opening-hours.js';
import { catalogPrice, memberCan, transitionVendor } from './vendor.js';

// Lagos is UTC+1 all year. 2026-11-20 is a Friday (dayOfWeek 5).
const lagos = (iso: string): Date => new Date(`${iso}+01:00`);

describe('opening hours (Africa/Lagos)', () => {
  it('converts instants to Lagos weekday and minute', () => {
    expect(lagosWeekMinute(lagos('2026-11-20T09:30:00'))).toEqual({ dayOfWeek: 5, minute: 570 });
    // 23:30 UTC Thursday is 00:30 Friday in Lagos
    expect(lagosWeekMinute(new Date('2026-11-19T23:30:00Z'))).toEqual({ dayOfWeek: 5, minute: 30 });
  });

  it('is open inside a same-day interval and closed at the closing minute', () => {
    const hours = [{ dayOfWeek: 5, opensAt: '08:00', closesAt: '22:00' }];
    expect(isOpenAt(hours, lagos('2026-11-20T08:00:00'))).toBe(true);
    expect(isOpenAt(hours, lagos('2026-11-20T21:59:00'))).toBe(true);
    expect(isOpenAt(hours, lagos('2026-11-20T22:00:00'))).toBe(false);
    expect(isOpenAt(hours, lagos('2026-11-20T07:59:00'))).toBe(false);
    expect(isOpenAt(hours, lagos('2026-11-21T10:00:00'))).toBe(false);
  });

  it('handles overnight hours spilling into the next day', () => {
    const fridayNight = [{ dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' }];
    expect(isOpenAt(fridayNight, lagos('2026-11-20T23:00:00'))).toBe(true);
    expect(isOpenAt(fridayNight, lagos('2026-11-21T01:59:00'))).toBe(true);
    expect(isOpenAt(fridayNight, lagos('2026-11-21T02:00:00'))).toBe(false);
    expect(isOpenAt(fridayNight, lagos('2026-11-20T01:00:00'))).toBe(false);
  });

  it('wraps Saturday-night hours into Sunday morning', () => {
    const saturdayNight = [{ dayOfWeek: 6, opensAt: '20:00', closesAt: '03:00' }];
    expect(isOpenAt(saturdayNight, lagos('2026-11-22T01:00:00'))).toBe(true);
    expect(isOpenAt(saturdayNight, lagos('2026-11-22T04:00:00'))).toBe(false);
  });

  it('supports 24-hour days via 24:00 and is closed with no hours', () => {
    expect(
      isOpenAt(
        [{ dayOfWeek: 5, opensAt: '00:00', closesAt: '24:00' }],
        lagos('2026-11-20T23:59:00'),
      ),
    ).toBe(true);
    expect(isOpenAt([], lagos('2026-11-20T12:00:00'))).toBe(false);
  });

  it('rejects malformed times and overlapping intervals', () => {
    expect(toMinutes('24:00')).toBe(1440);
    expect(() => toMinutes('24:30')).toThrow(CatalogError);
    expect(() => toMinutes('7:00')).toThrow(CatalogError);
    expect(() => {
      assertValidWeeklyHours([{ dayOfWeek: 7, opensAt: '08:00', closesAt: '09:00' }]);
    }).toThrow('dayOfWeek');
    expect(() => {
      assertValidWeeklyHours([{ dayOfWeek: 1, opensAt: '08:00', closesAt: '08:00' }]);
    }).toThrow('non-empty');
    expect(() => {
      assertValidWeeklyHours([
        { dayOfWeek: 1, opensAt: '08:00', closesAt: '14:00' },
        { dayOfWeek: 1, opensAt: '13:00', closesAt: '18:00' },
      ]);
    }).toThrow('overlap');
    expect(() => {
      assertValidWeeklyHours([
        { dayOfWeek: 6, opensAt: '20:00', closesAt: '03:00' },
        { dayOfWeek: 0, opensAt: '02:00', closesAt: '10:00' },
      ]);
    }).toThrow('overlap');
    expect(() => {
      assertValidWeeklyHours([
        { dayOfWeek: 1, opensAt: '08:00', closesAt: '14:00' },
        { dayOfWeek: 1, opensAt: '14:00', closesAt: '02:00' },
      ]);
    }).not.toThrow();
  });
});

describe('modifier groups', () => {
  it('validates group bounds', () => {
    expect(() => {
      assertValidModifierGroup({ minSelect: 0, maxSelect: 2, optionCount: 3 });
    }).not.toThrow();
    expect(() => {
      assertValidModifierGroup({ minSelect: -1, maxSelect: 1, optionCount: 1 });
    }).toThrow();
    expect(() => {
      assertValidModifierGroup({ minSelect: 0.5, maxSelect: 1, optionCount: 1 });
    }).toThrow();
    expect(() => {
      assertValidModifierGroup({ minSelect: 2, maxSelect: 1, optionCount: 3 });
    }).toThrow('<= maxSelect');
    expect(() => {
      assertValidModifierGroup({ minSelect: 0, maxSelect: 4, optionCount: 3 });
    }).toThrow('number of options');
  });

  const groups: ModifierGroupRule[] = [
    {
      id: 'g1',
      name: 'Protein',
      minSelect: 1,
      maxSelect: 2,
      options: [
        { id: 'beef', priceDeltaMinor: 50_000, available: true },
        { id: 'chicken', priceDeltaMinor: 120_000, available: true },
        { id: 'fish', priceDeltaMinor: 100_000, available: false },
      ],
    },
    {
      id: 'g2',
      name: 'Spice',
      minSelect: 0,
      maxSelect: 1,
      options: [{ id: 'hot', priceDeltaMinor: 0, available: true }],
    },
  ];

  it('sums price deltas in kobo for a valid selection', () => {
    const r = validateSelection(groups, ['beef', 'chicken', 'hot']);
    expect(r.ok && r.priceDelta.minor).toBe(170_000);
  });

  it('rejects below-min, above-max, unknown, unavailable and duplicate choices', () => {
    const errorsOf = (ids: string[]): readonly string[] => {
      const r = validateSelection(groups, ids);
      return r.ok ? [] : r.errors;
    };
    expect(errorsOf([])).toContain('Protein: choose at least 1');
    expect(errorsOf(['beef', 'chicken', 'fish'])).toEqual(
      expect.arrayContaining(['Protein: choose at most 2', 'Option fish is unavailable']),
    );
    expect(errorsOf(['beef', 'nope'])).toContain('Unknown option nope');
    expect(errorsOf(['beef', 'beef'])).toContain('An option was selected more than once');
  });
});

describe('vendor policies', () => {
  it('allows only listed status transitions', () => {
    expect(transitionVendor('in_review', 'live')).toBe('live');
    expect(transitionVendor('suspended', 'live')).toBe('live');
    expect(() => transitionVendor('draft', 'live')).toThrow(CatalogError);
    expect(() => transitionVendor('live', 'draft')).toThrow('cannot move');
  });

  it('lets staff toggle availability but not edit the menu or hours', () => {
    expect(memberCan('staff', 'toggle_availability')).toBe(true);
    expect(memberCan('staff', 'manage_menu')).toBe(false);
    expect(memberCan('staff', 'manage_hours')).toBe(false);
    expect(memberCan('owner', 'manage_hours')).toBe(true);
  });

  it('accepts integer kobo prices only', () => {
    expect(catalogPrice(350_000).format()).toBe('₦3,500.00');
    expect(() => catalogPrice(10.5)).toThrow(CatalogError);
    expect(() => catalogPrice(-1)).toThrow(CatalogError);
  });
});
