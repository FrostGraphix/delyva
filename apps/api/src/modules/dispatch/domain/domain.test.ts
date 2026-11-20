import { describe, expect, it } from 'vitest';
import { DispatchError } from './dispatch-errors.js';
import {
  type DispatchCandidate,
  dispatchDelayMs,
  EtaFirstStrategy,
  pickupEtaSeconds,
  radiusStepForDeclines,
} from './dispatch-strategy.js';
import { assertNear, chooseFix, type GpsPolicy } from './gps.js';
import { acceptanceRateBps, statusAfterGoOffline, statusAfterGoOnline } from './rider.js';
import { isTerminalTrip, planTripAction } from './trip.js';

const ctx = { now: new Date('2026-11-20T12:00:00Z'), riderSpeedMps: 6 };
const cand = (riderId: string, o: Partial<DispatchCandidate> = {}): DispatchCandidate => ({
  riderId,
  distanceM: 600,
  acceptanceRateBps: 8_000,
  ratingX100: 450,
  lastJobAt: null,
  ...o,
});

describe('EtaFirstStrategy scoring order', () => {
  const rank = (cs: DispatchCandidate[]): string[] =>
    new EtaFirstStrategy().rank(cs, ctx).map((c) => c.riderId);

  it('ranks the nearest pickup ETA first across minute buckets', () => {
    expect(rank([cand('far', { distanceM: 2_000 }), cand('near', { distanceM: 300 })])).toEqual([
      'near',
      'far',
    ]);
  });

  it('breaks an ETA tie by acceptance rate, then rating, then fairness', () => {
    const ranked = rank([
      cand('a-low-accept', { distanceM: 100, acceptanceRateBps: 5_000 }),
      cand('b-recent-job', { distanceM: 110, lastJobAt: new Date('2026-11-20T11:59:00Z') }),
      cand('c-idle-long', { distanceM: 120, lastJobAt: new Date('2026-11-20T09:00:00Z') }),
      cand('d-top-rating', { distanceM: 130, ratingX100: 490 }),
      cand('e-new-rider', { distanceM: 140, acceptanceRateBps: null }),
    ]);
    // same minute bucket → acceptance desc (null = 80 % prior) → rating desc → idle longest
    // first (never had a job = longest idle)
    expect(ranked).toEqual([
      'd-top-rating',
      'e-new-rider',
      'c-idle-long',
      'b-recent-job',
      'a-low-accept',
    ]);
  });

  it('computes a rounded-up straight-line pickup ETA', () => {
    expect(pickupEtaSeconds(601, 6)).toBe(101);
    expect(
      new EtaFirstStrategy().rank([cand('x', { distanceM: 60 })], ctx)[0]?.pickupEtaSeconds,
    ).toBe(10);
  });
});

describe('radius and timing policies', () => {
  it('widens one step every N declines and caps at the last radius', () => {
    expect([0, 2, 3, 5, 6, 30].map((d) => radiusStepForDeclines(d, 3, 3))).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
  });

  it('schedules at readyAt minus travel, never in the past', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    expect(dispatchDelayMs(new Date('2026-11-20T12:20:00Z'), now, 300)).toBe(15 * 60_000);
    expect(dispatchDelayMs(new Date('2026-11-20T12:02:00Z'), now, 300)).toBe(0);
  });
});

describe('rider availability', () => {
  it('computes acceptance rate in basis points', () => {
    expect(acceptanceRateBps({ offersReceived: 0, offersAccepted: 0 })).toBeNull();
    expect(acceptanceRateBps({ offersReceived: 3, offersAccepted: 2 })).toBe(6_666);
  });

  it('rejects going online with a low battery and keeps on_trip riders on trip', () => {
    expect(() => statusAfterGoOnline('offline', 10, 15)).toThrow(DispatchError);
    expect(statusAfterGoOnline('offline', 80, 15)).toBe('online');
    expect(statusAfterGoOnline('on_trip', 80, 15)).toBe('on_trip');
  });

  it('rejects going offline during a trip', () => {
    expect(statusAfterGoOffline('online')).toBe('offline');
    expect(() => statusAfterGoOffline('on_trip')).toThrow(/current trip/);
  });
});

describe('trip transition table', () => {
  it('applies valid moves with the GPS target', () => {
    expect(planTripAction('assigned', 'arrived_at_vendor')).toEqual({
      kind: 'apply',
      to: 'at_vendor',
      near: 'pickup',
    });
    expect(planTripAction('at_customer', 'delivered')).toMatchObject({ near: 'dropoff' });
    expect(planTripAction('picked_up', 'undeliverable')).toMatchObject({ to: 'undeliverable' });
  });

  it('treats replays of passed actions as already applied', () => {
    expect(planTripAction('at_vendor', 'arrived_at_vendor').kind).toBe('already_applied');
    expect(planTripAction('delivered', 'picked_up').kind).toBe('already_applied');
    expect(planTripAction('undeliverable', 'undeliverable').kind).toBe('already_applied');
  });

  it('rejects skipping steps and undeliverable after delivery', () => {
    expect(() => planTripAction('assigned', 'delivered')).toThrow(/Cannot delivered/);
    expect(() => planTripAction('delivered', 'undeliverable')).toThrow(DispatchError);
    expect(() => planTripAction('undeliverable', 'delivered')).toThrow(DispatchError);
  });

  it('knows terminal states', () => {
    expect(isTerminalTrip('delivered')).toBe(true);
    expect(isTerminalTrip('picked_up')).toBe(false);
  });
});

describe('GPS sanity check', () => {
  const policy: GpsPolicy = { maxDistanceM: 300, replayMaxAgeMs: 30 * 60_000 };
  const now = Date.parse('2026-11-20T12:00:00Z');
  const pickup = { lat: 6.4281, lng: 3.4219 };

  it('passes within the radius and rejects beyond it with rider_too_far', () => {
    expect(assertNear({ ...pickup, ts: now }, pickup, 'pickup', policy)).toBe(0);
    const far = { lat: 6.4381, lng: 3.4219, ts: now }; // ~1.1 km north
    expect(() => assertNear(far, pickup, 'pickup', policy)).toThrow(
      expect.objectContaining({ code: 'rider_too_far' }),
    );
    expect(() => assertNear(null, pickup, 'drop-off', policy)).toThrow(/No recent location/);
  });

  it('prefers the live server fix but accepts an older device fix for replays', () => {
    const server = { ...pickup, ts: now };
    expect(chooseFix(server, undefined, now, policy)?.source).toBe('server');
    expect(chooseFix(server, { ...pickup, ts: now - 1_000 }, now, policy)?.source).toBe('server');
    expect(chooseFix(server, { ...pickup, ts: now - 10 * 60_000 }, now, policy)?.source).toBe(
      'device',
    );
    expect(chooseFix(null, { ...pickup, ts: now - 60_000 }, now, policy)?.source).toBe('device');
  });

  it('ignores stale or future device fixes', () => {
    expect(chooseFix(null, { ...pickup, ts: now - 31 * 60_000 }, now, policy)).toBeNull();
    expect(chooseFix(null, { ...pickup, ts: now + 120_000 }, now, policy)).toBeNull();
  });
});
