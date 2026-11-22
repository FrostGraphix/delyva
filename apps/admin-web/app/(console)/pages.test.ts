import type { OrderPage, OrderSummary } from '@delyva/contracts';
import { describe, expect, it, vi } from 'vitest';
import { findOrderSummary } from './orders/[id]/find-order';
import { countInProgress, countOrders, countRiders } from './overview/kpis';
import { buildPromo, lagosLocalToIso, type PromoFormValues } from './pricing/promo-form';

const order = (id: string, status: OrderSummary['status'] = 'PLACED'): OrderSummary => ({
  id,
  ref: `DLV-${id}`,
  status,
  vendorId: id,
  vendorName: 'V',
  branchId: id,
  customerId: id,
  total: { amountMinor: 100, currency: 'NGN' },
  itemCount: 1,
  createdAt: '2026-11-21T10:00:00.000Z',
});

describe('overview KPIs', () => {
  it('never invents totals: a further page shows "n+"', () => {
    expect(countOrders({ items: [order('a')], nextCursor: null })).toBe('1');
    expect(countOrders({ items: [order('a'), order('b')], nextCursor: 'c' })).toBe('2+');
  });

  it('counts in-progress orders and online riders', () => {
    expect(
      countInProgress({
        items: [order('a'), order('b', 'DELIVERED'), order('c', 'PICKED_UP')],
        nextCursor: null,
      }),
    ).toBe(2);
    const r = (status: 'online' | 'on_trip' | 'offline') => ({
      riderId: 'x',
      status,
      vehiclePlate: null,
      batteryPct: null,
      position: null,
      activeOrderId: null,
    });
    expect(countRiders({ items: [r('online'), r('on_trip'), r('offline')] })).toEqual({
      online: 2,
      onTrip: 1,
    });
  });
});

describe('findOrderSummary', () => {
  it('walks cursor pages until it finds the id', async () => {
    const pages: OrderPage[] = [
      { items: [order('a')], nextCursor: 'p2' },
      { items: [order('b')], nextCursor: null },
    ];
    const list = vi.fn(
      (q: { cursor?: string }) =>
        Promise.resolve(q.cursor ? (pages[1] ?? pages[0]) : pages[0]) as Promise<OrderPage>,
    );
    expect((await findOrderSummary('b', list))?.ref).toBe('DLV-b');
    expect(list).toHaveBeenCalledTimes(2);
    expect(await findOrderSummary('zzz', list)).toBeNull();
  });
});

describe('promo form', () => {
  const base: PromoFormValues = {
    code: 'WELCOME500',
    type: 'fixed_off',
    value: '500',
    percentBps: '1000',
    maxDiscount: '',
    minOrder: '2000',
    audience: 'new_users',
    startsAt: '2026-12-01T00:00',
    endsAt: '2026-12-31T23:59',
    perUserLimit: '1',
  };

  it('builds a kobo body interpreted in Lagos time', () => {
    const r = buildPromo(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body.valueMinor).toBe(50_000);
      expect(r.body.minOrderMinor).toBe(200_000);
      expect(r.body.startsAt).toBe('2026-11-30T23:00:00.000Z');
      expect(r.body.percentBps).toBeNull();
    }
  });

  it('reports the first bad field', () => {
    expect(buildPromo({ ...base, endsAt: '2026-11-01T00:00' })).toEqual({
      ok: false,
      field: 'dates',
    });
    expect(buildPromo({ ...base, minOrder: 'x' })).toEqual({ ok: false, field: 'minOrder' });
    expect(buildPromo({ ...base, code: 'bad code' })).toEqual({ ok: false, field: 'code' });
    expect(lagosLocalToIso('nope')).toBeNull();
  });
});
