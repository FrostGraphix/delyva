import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import type { AuthPrincipal } from '../../../shared/auth/auth.guard.js';
import { EtaFirstStrategy } from '../domain/dispatch-strategy.js';
import { INITIAL_RATING_X100, type RiderProfileState, type RiderStatus } from '../domain/rider.js';
import { ACTIVE_TRIP_STATUSES, type TripStatus } from '../domain/trip.js';
// eslint-disable-next-line no-restricted-imports -- TEMP(ordering-contract): port test double lives in infrastructure
import { InMemoryOrderFulfilment } from '../infrastructure/in-memory-order-fulfilment.temp.js';
import { HandleOrderingEvent } from './handle-ordering-event.use-case.js';
import { OpsDispatch } from './ops-dispatch.use-cases.js';
import type {
  DispatchConfig,
  DispatchEvent,
  DispatchRequest,
  DispatchStore,
  OfferRecord,
  OrderLock,
  RiderCounter,
  TripRecord,
} from './ports.js';
import { RespondToOffer } from './respond-to-offer.use-cases.js';
import { RiderSelfService } from './rider-availability.use-cases.js';
import { RunDispatchRound } from './run-dispatch-round.use-case.js';
import { ScheduleDispatch } from './schedule-dispatch.use-case.js';
import { PerformTripAction } from './trip-actions.use-case.js';

/** In-memory store (no rollback; integration tests cover real transactions). */
class MemoryStore implements DispatchStore {
  riders = new Map<string, RiderProfileState>();
  requests = new Map<string, DispatchRequest>();
  offers = new Map<string, OfferRecord>();
  trips = new Map<string, TripRecord>();
  events: DispatchEvent[] = [];
  transaction<T>(fn: (tx: DispatchStore) => Promise<T>): Promise<T> {
    return fn(this);
  }
  emit(e: DispatchEvent): Promise<void> {
    this.events.push(e);
    return Promise.resolve();
  }
  getRider(id: string) {
    return Promise.resolve(this.riders.get(id) ?? null);
  }
  ensureRider(id: string) {
    if (!this.riders.has(id)) {
      this.riders.set(id, {
        riderId: id,
        vehiclePlate: null,
        hub: null,
        batteryPct: null,
        status: 'offline',
        offersReceived: 0,
        offersAccepted: 0,
        offersDeclined: 0,
        offersExpired: 0,
        ratingX100: INITIAL_RATING_X100,
        lastJobAt: null,
      });
    }
    return this.getRider(id) as Promise<RiderProfileState>;
  }
  private patchRider(id: string, p: Partial<RiderProfileState>): Promise<void> {
    const r = this.riders.get(id);
    if (r) this.riders.set(id, { ...r, ...p });
    return Promise.resolve();
  }
  setRiderStatus(id: string, status: RiderStatus, batteryPct?: number) {
    return this.patchRider(id, { status, ...(batteryPct === undefined ? {} : { batteryPct }) });
  }
  incrementRider(id: string, c: RiderCounter) {
    return this.patchRider(id, { [c]: (this.riders.get(id)?.[c] ?? 0) + 1 });
  }
  setLastJobAt(id: string, at: Date) {
    return this.patchRider(id, { lastJobAt: at });
  }
  ridersByIds(ids: readonly string[]) {
    return Promise.resolve([...this.riders.values()].filter((r) => ids.includes(r.riderId)));
  }
  ridersWithStatus(s: readonly RiderStatus[]) {
    return Promise.resolve([...this.riders.values()].filter((r) => s.includes(r.status)));
  }
  insertRequest(r: DispatchRequest) {
    if (this.requests.has(r.orderId)) return Promise.resolve(false);
    this.requests.set(r.orderId, r);
    return Promise.resolve(true);
  }
  getRequest(id: string) {
    return Promise.resolve(this.requests.get(id) ?? null);
  }
  updateRequest(id: string, p: Partial<DispatchRequest>) {
    const r = this.requests.get(id);
    if (r) this.requests.set(id, { ...r, ...p });
    return Promise.resolve();
  }
  insertOffer(o: OfferRecord) {
    this.offers.set(o.id, o);
    return Promise.resolve();
  }
  getOffer(id: string) {
    return Promise.resolve(this.offers.get(id) ?? null);
  }
  pendingOfferForOrder(orderId: string) {
    const o = [...this.offers.values()].find(
      (x) => x.orderId === orderId && x.status === 'pending',
    );
    return Promise.resolve(o ?? null);
  }
  setOfferStatus(id: string, status: OfferRecord['status']) {
    const o = this.offers.get(id);
    if (o) this.offers.set(id, { ...o, status });
    return Promise.resolve();
  }
  offeredRiderIds(orderId: string) {
    return Promise.resolve(
      [...this.offers.values()].filter((o) => o.orderId === orderId).map((o) => o.riderId),
    );
  }
  ridersWithPendingOffers(ids: readonly string[]) {
    return Promise.resolve(
      [...this.offers.values()]
        .filter((o) => o.status === 'pending' && ids.includes(o.riderId))
        .map((o) => o.riderId),
    );
  }
  insertTrip(t: TripRecord) {
    this.trips.set(t.id, t);
    return Promise.resolve();
  }
  getTrip(id: string) {
    return Promise.resolve(this.trips.get(id) ?? null);
  }
  private active(pred: (t: TripRecord) => boolean) {
    const t = [...this.trips.values()].find(
      (x) => pred(x) && ACTIVE_TRIP_STATUSES.includes(x.status),
    );
    return Promise.resolve(t ?? null);
  }
  activeTripForRider(id: string) {
    return this.active((t) => t.riderId === id);
  }
  activeTripForOrder(id: string) {
    return this.active((t) => t.orderId === id);
  }
  updateTrip(id: string, p: Partial<TripRecord>) {
    const t = this.trips.get(id);
    if (t) this.trips.set(id, { ...t, ...p });
    return Promise.resolve();
  }
  countTrips(id: string, s: TripStatus) {
    return Promise.resolve(
      [...this.trips.values()].filter((t) => t.riderId === id && t.status === s).length,
    );
  }
}

/** Serialising lock (a promise chain per order). */
class MemoryLock implements OrderLock {
  private tails = new Map<string, Promise<unknown>>();
  withLock<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(orderId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.tails.set(
      orderId,
      run.catch(() => undefined),
    );
    return run;
  }
}

const PICKUP = { lat: 6.4281, lng: 3.4219 };
const DROPOFF = { lat: 6.4355, lng: 3.4567 };
const config: DispatchConfig = {
  offerTimeoutMs: 20_000,
  radiiM: [1_000, 3_000, 5_000],
  declinesBeforeWiden: 2,
  maxOffers: 4,
  gpsMaxDistanceM: 300,
  gpsReplayMaxAgeMs: 30 * 60_000,
  riderSpeedMps: 6,
  defaultTravelSeconds: 600,
  minBatteryPct: 15,
};
const logger = pino({ level: 'silent' });
const rider = (userId: string, roles = ['rider']): AuthPrincipal => ({ userId, roles });

function setup() {
  let now = new Date('2026-11-20T12:00:00Z');
  const clock = { now: () => now, uuid: () => randomUUID() };
  const store = new MemoryStore();
  const lock = new MemoryLock();
  const positions = new Map<string, { lat: number; lng: number; ts: number }>();
  const trackingCalls: string[] = [];
  const tracking = {
    positionOf: (id: string) =>
      Promise.resolve(
        positions.has(id)
          ? { ...(positions.get(id) as { lat: number; lng: number; ts: number }), heading: null }
          : null,
      ),
    ridersNear: (lat: number, lng: number, radiusM: number, limit: number) => {
      const near = [...positions.entries()]
        .map(([riderId, p]) => ({
          riderId,
          distanceM: Math.hypot((p.lat - lat) * 111_000, (p.lng - lng) * 110_000),
        }))
        .filter((r) => r.distanceM <= radiusM)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, limit);
      return Promise.resolve(near);
    },
    startTrip: (r: string, o: string) => {
      trackingCalls.push(`start:${r}:${o}`);
      return Promise.resolve();
    },
    endTrip: (r: string) => {
      trackingCalls.push(`end:${r}`);
      return Promise.resolve();
    },
  };
  const scheduled: string[] = [];
  const scheduler = {
    scheduleStart: (o: string, d: number) => (scheduled.push(`start:${o}:${d}`), Promise.resolve()),
    scheduleTimeout: (o: string, d: number) => (
      scheduled.push(`timeout:${o}:${d}`),
      Promise.resolve()
    ),
    scheduleNextRound: (o: string) => (scheduled.push(`next:${o}`), Promise.resolve()),
  };
  const sent: { riderId: string; offerId: string }[] = [];
  let notifierFails = false;
  const notifier = {
    offerSent: (riderId: string, offer: { id: string }) => {
      if (notifierFails) return Promise.reject(new Error('push down'));
      sent.push({ riderId, offerId: offer.id });
      return Promise.resolve();
    },
  };
  let zoneMap: (p: { lat: number; lng: number }) => string[] = () => [];
  const zones = {
    zonesContaining: (p: { lat: number; lng: number }) => Promise.resolve(zoneMap(p)),
  };
  const port = new InMemoryOrderFulfilment();
  const strategy = new EtaFirstStrategy();
  const round = new RunDispatchRound({
    store,
    tracking,
    zones,
    strategy,
    lock,
    scheduler,
    notifier,
    clock,
    config,
    logger,
  });
  const offers = new RespondToOffer({ store, port, tracking, clock, lock, scheduler, config });
  const trips = new PerformTripAction({ store, port, tracking, lock, clock, config, logger });
  const ops = new OpsDispatch({ store, port, tracking, clock, lock, logger });
  const self = new RiderSelfService(store, config);
  const schedule = new ScheduleDispatch({ store, tracking, scheduler, clock, config });
  const at = (id: string, p: { lat: number; lng: number }) =>
    positions.set(id, { ...p, ts: now.getTime() });
  const online = async (id: string, p = PICKUP, o: Partial<RiderProfileState> = {}) => {
    await self.goOnline(rider(id), 80);
    const r = store.riders.get(id);
    if (r) store.riders.set(id, { ...r, ...o });
    at(id, p);
  };
  const request = async (orderId = randomUUID()) => {
    await schedule.execute({
      orderId,
      branchId: randomUUID(),
      pickup: PICKUP,
      dropoff: DROPOFF,
      prepMinutes: 15,
      readyAt: '2026-11-20T12:15:00.000Z',
    });
    return orderId;
  };
  return {
    store,
    port,
    round,
    offers,
    trips,
    ops,
    self,
    schedule,
    scheduled,
    sent,
    trackingCalls,
    at,
    online,
    request,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    failNotifier: () => {
      notifierFails = true;
    },
    setZones: (f: (p: { lat: number; lng: number }) => string[]) => {
      zoneMap = f;
    },
  };
}

const offset = (meters: number) => ({ lat: PICKUP.lat + meters / 111_000, lng: PICKUP.lng });

describe('ScheduleDispatch / HandleOrderingEvent', () => {
  it('schedules the first round at readyAt minus the nearest rider travel time, idempotently', async () => {
    const t = setup();
    await t.online('r1', offset(595)); // ~595 m at 6 m/s → ceil = 100 s
    const orderId = await t.request();
    expect(t.scheduled).toEqual([`start:${orderId}:${(15 * 60 - 100) * 1_000}`]);
    const again = await t.schedule.execute({
      orderId,
      branchId: randomUUID(),
      pickup: PICKUP,
      dropoff: DROPOFF,
      prepMinutes: 15,
      readyAt: '2026-11-20T12:15:00.000Z',
    });
    expect(again.duplicate).toBe(true);
  });

  it('falls back to the default travel time when nobody is near', async () => {
    const t = setup();
    const orderId = await t.request();
    expect(t.scheduled).toEqual([`start:${orderId}:${(15 * 60 - 600) * 1_000}`]);
  });

  it('ignores unknown types and invalid payloads', async () => {
    const t = setup();
    const h = new HandleOrderingEvent(t.schedule);
    expect(await h.execute({ type: 'ordering.order.placed', payload: {} })).toEqual({
      status: 'ignored',
      reason: 'unknown_type',
    });
    expect(
      await h.execute({ type: 'ordering.order.vendor_accepted', payload: { orderId: 'x' } }),
    ).toEqual({ status: 'ignored', reason: 'invalid_payload' });
    const ok = await h.execute({
      type: 'ordering.order.vendor_accepted',
      payload: {
        orderId: randomUUID(),
        branchId: randomUUID(),
        pickup: PICKUP,
        dropoff: DROPOFF,
        prepMinutes: 10,
        readyAt: '2026-11-20T12:10:00.000Z',
      },
    });
    expect(ok.status).toBe('scheduled');
  });
});

describe('RunDispatchRound', () => {
  it('offers to exactly one best rider and skips while that offer is pending', async () => {
    const t = setup();
    await t.online('far', offset(800));
    await t.online('near', offset(100));
    const orderId = await t.request();
    const first = await t.round.execute(orderId);
    expect(first).toMatchObject({ kind: 'offered', riderId: 'near', radiusM: 1_000 });
    expect(await t.round.execute(orderId)).toEqual({ kind: 'skipped', reason: 'offer_pending' });
    expect([...t.store.offers.values()].filter((o) => o.status === 'pending')).toHaveLength(1);
    expect(t.sent).toHaveLength(1);
    expect(t.scheduled.at(-1)).toMatch(/^timeout:.*:20000$/);
    expect(t.store.events.map((e) => e.type)).toEqual(['dispatch.offer.sent']);
  });

  it('excludes offline, on-trip and already-offered riders and riders holding another offer', async () => {
    const t = setup();
    await t.online('busy', offset(50));
    const other = await t.request();
    await t.round.execute(other); // busy now holds a pending offer
    await t.online('offline', offset(60));
    await t.self.goOffline(rider('offline'), 50);
    await t.online('ok', offset(70));
    const orderId = await t.request();
    expect(await t.round.execute(orderId)).toMatchObject({ riderId: 'ok' });
  });

  it('widens the radius when nobody is eligible nearby', async () => {
    const t = setup();
    await t.online('r4k', offset(4_000));
    const orderId = await t.request();
    expect(await t.round.execute(orderId)).toMatchObject({ kind: 'offered', radiusM: 5_000 });
    expect(t.store.requests.get(orderId)?.radiusStep).toBe(2);
  });

  it('escalates to ops when no candidate exists in any radius', async () => {
    const t = setup();
    const orderId = await t.request();
    expect(await t.round.execute(orderId)).toEqual({ kind: 'unassigned', reason: 'no_candidates' });
    expect(t.store.requests.get(orderId)?.status).toBe('unassigned');
    expect(t.store.events.at(-1)?.type).toBe('dispatch.order.unassigned');
    expect(await t.round.execute(orderId)).toEqual({ kind: 'skipped', reason: 'unassigned' });
  });

  it('escalates once the offer budget is spent and skips unknown orders', async () => {
    const t = setup();
    const orderId = await t.request();
    await t.store.updateRequest(orderId, { attempts: config.maxOffers });
    expect(await t.round.execute(orderId)).toEqual({
      kind: 'unassigned',
      reason: 'max_offers_reached',
    });
    expect(await t.round.execute(randomUUID())).toEqual({
      kind: 'skipped',
      reason: 'unknown_order',
    });
  });

  it('only offers to riders inside a zone that serves the pickup', async () => {
    const t = setup();
    await t.online('outside', offset(50));
    await t.online('inside', offset(400));
    t.setZones((p) =>
      p.lat > PICKUP.lat + 300 / 111_000 || p.lat === PICKUP.lat ? ['vi'] : ['other'],
    );
    const orderId = await t.request();
    expect(await t.round.execute(orderId)).toMatchObject({ riderId: 'inside' });
  });

  it('keeps the offer when the notification fails', async () => {
    const t = setup();
    t.failNotifier();
    await t.online('r1');
    const orderId = await t.request();
    expect(await t.round.execute(orderId)).toMatchObject({ kind: 'offered' });
  });
});

describe('RespondToOffer', () => {
  async function offered() {
    const t = setup();
    await t.online('r1', offset(100));
    await t.online('r2', offset(200));
    await t.online('r3', offset(300));
    const orderId = await t.request();
    const out = await t.round.execute(orderId);
    if (out.kind !== 'offered') throw new Error('expected offer');
    return { t, orderId, offerId: out.offerId };
  }

  it('accept assigns the rider, tells ordering, starts the trip and is idempotent', async () => {
    const { t, orderId, offerId } = await offered();
    const trip = await t.offers.accept(rider('r1'), offerId);
    expect(trip).toMatchObject({ orderId, riderId: 'r1', status: 'assigned', assignment: 'offer' });
    expect(t.port.calls).toEqual([{ method: 'markRiderAssigned', orderId, riderId: 'r1' }]);
    expect(t.trackingCalls).toEqual([`start:r1:${orderId}`]);
    expect(t.store.riders.get('r1')).toMatchObject({ status: 'on_trip', offersAccepted: 1 });
    expect(t.store.events.map((e) => e.type)).toContain('dispatch.offer.accepted');
    expect((await t.offers.accept(rider('r1'), offerId)).id).toBe(trip.id);
    expect(t.port.calls).toHaveLength(1);
    expect((await t.self.currentTrip(rider('r1'))).trip?.id).toBe(trip.id);
  });

  it('hides other riders’ offers (IDOR) and rejects non-riders', async () => {
    const { t, offerId } = await offered();
    await expect(t.offers.accept(rider('r2'), offerId)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(t.offers.decline(rider('r2'), offerId)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(t.offers.accept(rider('r1', ['customer']), offerId)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('rejects an expired offer', async () => {
    const { t, offerId } = await offered();
    t.advance(config.offerTimeoutMs);
    await expect(t.offers.accept(rider('r1'), offerId)).rejects.toMatchObject({
      code: 'offer_unavailable',
    });
  });

  it('decline moves to the next candidate; timeouts do too; replays are harmless', async () => {
    const { t, orderId, offerId } = await offered();
    const declined = await t.offers.decline(rider('r1'), offerId);
    expect(declined.status).toBe('declined');
    expect(await t.offers.decline(rider('r1'), offerId)).toMatchObject({ status: 'declined' });
    expect(t.scheduled.filter((s) => s === `next:${orderId}`)).toHaveLength(2);
    const second = await t.round.execute(orderId);
    expect(second).toMatchObject({ riderId: 'r2' });
    if (second.kind !== 'offered') throw new Error('expected offer');
    expect(await t.offers.expire(second.offerId)).toBe(true);
    expect(await t.offers.expire(second.offerId)).toBe(false);
    expect(await t.offers.expire(randomUUID())).toBe(false);
    expect(t.store.riders.get('r2')?.offersExpired).toBe(1);
    // 2 declines with N=2 → radius step 1
    expect(t.store.requests.get(orderId)).toMatchObject({ declines: 2, radiusStep: 1 });
    await expect(t.offers.accept(rider('r1'), offerId)).rejects.toMatchObject({
      code: 'offer_unavailable',
    });
    expect(t.store.events.filter((e) => e.type === 'dispatch.offer.declined')).toHaveLength(2);
  });
});

describe('PerformTripAction', () => {
  async function onTrip() {
    const t = setup();
    await t.online('r1', offset(100));
    const orderId = await t.request();
    t.port.setCodes(orderId, { pickupCode: '1234', deliveryOtp: '987654' });
    const out = await t.round.execute(orderId);
    if (out.kind !== 'offered') throw new Error('expected offer');
    const trip = await t.offers.accept(rider('r1'), out.offerId);
    return { t, orderId, tripId: trip.id };
  }

  it('runs the full trip with GPS checks and frees the rider at the end', async () => {
    const { t, orderId, tripId } = await onTrip();
    t.at('r1', PICKUP);
    await t.trips.execute(rider('r1'), tripId, 'arrived_at_vendor', { pickupCode: '1234' });
    await t.trips.execute(rider('r1'), tripId, 'picked_up', {});
    t.at('r1', DROPOFF);
    await t.trips.execute(rider('r1'), tripId, 'arrived_at_customer', {});
    const done = await t.trips.execute(rider('r1'), tripId, 'delivered', { deliveryOtp: '987654' });
    expect(done.status).toBe('delivered');
    expect(t.port.stageOf(orderId)).toBe('DELIVERED');
    expect(t.store.riders.get('r1')?.status).toBe('online');
    expect(t.trackingCalls.at(-1)).toBe('end:r1');
    expect((await t.self.earnings(rider('r1'))).completedTrips).toBe(1);
    expect((await t.self.currentTrip(rider('r1'))).trip).toBeNull();
  });

  it('rejects a status change far from the pickup with rider_too_far', async () => {
    const { t, tripId } = await onTrip();
    t.at('r1', offset(2_000));
    await expect(
      t.trips.execute(rider('r1'), tripId, 'arrived_at_vendor', { pickupCode: '1234' }),
    ).rejects.toMatchObject({ code: 'rider_too_far' });
    expect(t.port.calls.map((c) => c.method)).toEqual(['markRiderAssigned']);
  });

  it('hides other riders’ trips and treats replays as already applied', async () => {
    const { t, tripId } = await onTrip();
    await expect(t.trips.execute(rider('r2'), tripId, 'picked_up', {})).rejects.toMatchObject({
      code: 'not_found',
    });
    t.at('r1', PICKUP);
    await t.trips.execute(rider('r1'), tripId, 'arrived_at_vendor', { pickupCode: '1234' });
    t.at('r1', offset(5_000)); // moved on; replay must not hit GPS or ordering again
    const replay = await t.trips.execute(rider('r1'), tripId, 'arrived_at_vendor', {
      pickupCode: '1234',
    });
    expect(replay.status).toBe('at_vendor');
    expect(t.port.calls.filter((c) => c.method === 'markRiderAtVendor')).toHaveLength(1);
  });

  it('accepts an offline replay checked against the device fix recorded at the time', async () => {
    const { t, tripId } = await onTrip();
    t.at('r1', PICKUP);
    await t.trips.execute(rider('r1'), tripId, 'arrived_at_vendor', { pickupCode: '1234' });
    const recorded = { ...PICKUP, ts: Date.parse('2026-11-20T12:00:00Z') };
    t.advance(5 * 60_000);
    t.at('r1', offset(3_000));
    const out = await t.trips.execute(rider('r1'), tripId, 'picked_up', { location: recorded });
    expect(out.status).toBe('picked_up');
  });

  it('requires codes/reason and supports undeliverable', async () => {
    const { t, tripId } = await onTrip();
    t.at('r1', PICKUP);
    await expect(
      t.trips.execute(rider('r1'), tripId, 'arrived_at_vendor', {}),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await expect(
      t.trips.execute(rider('r1'), tripId, 'arrived_at_vendor', { pickupCode: '0000' }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await t.trips.execute(rider('r1'), tripId, 'arrived_at_vendor', { pickupCode: '1234' });
    await t.trips.execute(rider('r1'), tripId, 'picked_up', {});
    t.at('r1', DROPOFF);
    const out = await t.trips.execute(rider('r1'), tripId, 'undeliverable', {
      reason: 'Customer unreachable',
    });
    expect(out.status).toBe('undeliverable');
    expect(t.store.trips.get(tripId)?.undeliverableReason).toBe('Customer unreachable');
  });
});

describe('OpsDispatch and RiderSelfService', () => {
  const ops: AuthPrincipal = { userId: randomUUID(), roles: ['ops'] };

  it('lists online riders with positions and active orders', async () => {
    const t = setup();
    await t.online('r1');
    await t.self.profile(rider('r9')); // offline: not listed
    const list = await t.ops.riders(ops);
    expect(list.items).toEqual([
      expect.objectContaining({
        riderId: 'r1',
        status: 'online',
        position: expect.objectContaining({ lat: PICKUP.lat }) as unknown,
        activeOrderId: null,
      }),
    ]);
    await expect(t.ops.riders(rider('r1'))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('manual assign supersedes the pending offer, records the reason and is idempotent', async () => {
    const t = setup();
    await t.online('r1', offset(100));
    await t.online('r2', offset(5_000));
    const orderId = await t.request();
    const out = await t.round.execute(orderId);
    if (out.kind !== 'offered') throw new Error('expected offer');
    const trip = await t.ops.assign(ops, orderId, 'r2', 'VIP order, rider known to vendor');
    expect(trip).toMatchObject({ riderId: 'r2', assignment: 'manual' });
    expect(t.store.offers.get(out.offerId)?.status).toBe('superseded');
    expect(t.store.trips.get(trip.id)?.assignmentReason).toBe('VIP order, rider known to vendor');
    expect((await t.ops.assign(ops, orderId, 'r2', 'again please')).id).toBe(trip.id);
    await expect(t.ops.assign(ops, orderId, 'r1', 'switch rider')).rejects.toMatchObject({
      code: 'order_already_assigned',
    });
    await expect(t.offers.accept(rider('r1'), out.offerId)).rejects.toMatchObject({
      code: 'offer_unavailable',
    });
    await expect(t.ops.assign(ops, randomUUID(), 'r1', 'no such order')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('rejects assigning an offline rider', async () => {
    const t = setup();
    const orderId = await t.request();
    await t.self.profile(rider('r1'));
    await expect(t.ops.assign(ops, orderId, 'r1', 'manual test')).rejects.toMatchObject({
      code: 'rider_unavailable',
    });
  });

  it('rider self-service: profile, online/offline, earnings placeholder, role check', async () => {
    const t = setup();
    expect(await t.self.profile(rider('r1'))).toMatchObject({
      status: 'offline',
      rating: 5,
      stats: { acceptanceRateBps: null },
    });
    expect(await t.self.goOnline(rider('r1'), 64)).toMatchObject({
      status: 'online',
      batteryPct: 64,
    });
    await expect(t.self.goOnline(rider('r1'), 5)).rejects.toMatchObject({
      code: 'validation_failed',
    });
    expect(await t.self.goOffline(rider('r1'), 60)).toMatchObject({ status: 'offline' });
    expect(await t.self.earnings(rider('r1'))).toEqual({
      currency: 'NGN',
      balanceMinor: null,
      completedTrips: 0,
      available: false,
    });
    await expect(t.self.profile(rider('c1', ['customer']))).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});
