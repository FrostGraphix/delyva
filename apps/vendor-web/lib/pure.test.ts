import { describe, expect, it } from 'vitest';
import { parseOptionLines } from '../components/menu/item-dialogs';
import { fromWeek, toWeek } from './hours';
import { t, tMaybe } from './i18n';
import { formatMoney, minorToNairaInput, parseNairaToMinor, sumMoney } from './money';
import { normaliseNigerianPhone } from './phone';

describe('money', () => {
  it('parses naira input into integer kobo without floats', () => {
    expect(parseNairaToMinor('3500')).toBe(350_000);
    expect(parseNairaToMinor('₦3,500.5')).toBe(350_050);
    expect(parseNairaToMinor('0.07')).toBe(7);
    expect(parseNairaToMinor('12.345')).toBeNull();
    expect(parseNairaToMinor('-1')).toBeNull();
    expect(parseNairaToMinor('abc')).toBeNull();
  });

  it('round-trips kobo to an editable string', () => {
    expect(minorToNairaInput(350_000)).toBe('3500');
    expect(minorToNairaInput(350_005)).toBe('3500.05');
  });

  it('formats and sums NGN amounts', () => {
    expect(formatMoney({ amountMinor: 350_000, currency: 'NGN' })).toContain('3,500');
    expect(
      sumMoney(
        [
          { amountMinor: 1, currency: 'NGN' },
          { amountMinor: 2, currency: 'NGN' },
        ],
        'NGN',
      ).amountMinor,
    ).toBe(3);
  });
});

describe('phone', () => {
  it('normalises local and international formats to E.164', () => {
    expect(normaliseNigerianPhone('0803 123 4567')).toBe('+2348031234567');
    expect(normaliseNigerianPhone('2348031234567')).toBe('+2348031234567');
    expect(normaliseNigerianPhone('+2348000000001')).toBe('+2348000000001');
  });

  it('rejects non-Nigerian or short numbers', () => {
    expect(normaliseNigerianPhone('12345')).toBeNull();
    expect(normaliseNigerianPhone('+447911123456')).toBeNull();
  });
});

describe('opening hours grid', () => {
  it('groups entries per day and flattens them back', () => {
    const week = toWeek([
      { dayOfWeek: 1, opensAt: '17:00', closesAt: '22:00' },
      { dayOfWeek: 1, opensAt: '09:00', closesAt: '12:00' },
    ]);
    expect(week[1]?.map((i) => i.opensAt)).toEqual(['09:00', '17:00']);
    expect(week[0]).toEqual([]);
    expect(fromWeek(week)).toHaveLength(2);
  });

  it('rejects an interval that opens and closes at the same time', () => {
    const week = toWeek([{ dayOfWeek: 2, opensAt: '09:00', closesAt: '10:00' }]).map((d) =>
      d.map((i) => ({ ...i, closesAt: i.opensAt })),
    );
    expect(fromWeek(week)).toBeNull();
  });
});

describe('option lines', () => {
  it('parses "Name, price" lines into kobo deltas', () => {
    expect(parseOptionLines('Chicken, 500\nBeef,1000.50\nPlain')).toEqual([
      { name: 'Chicken', priceDeltaMinor: 50_000 },
      { name: 'Beef', priceDeltaMinor: 100_050 },
      { name: 'Plain', priceDeltaMinor: 0 },
    ]);
  });

  it('rejects bad prices and empty input', () => {
    expect(parseOptionLines('Chicken, lots')).toBeNull();
    expect(parseOptionLines('  ')).toBeNull();
  });
});

describe('i18n', () => {
  it('interpolates variables and falls back for unknown computed keys', () => {
    expect(t('accept.minutes', { minutes: 15 })).toBe('15 min');
    expect(tMaybe('status.NOPE', 'status.other')).toBe(t('status.other'));
    expect(tMaybe('status.PLACED', 'status.other')).toBe('New');
  });
});
