import type { RiderLocation, RiderLocationBroadcast } from '@delyva/contracts';
import { describe, expect, it } from 'vitest';
import { DefaultLiveTrackingService } from './live-tracking.service.js';
import type { LocationStore, NearbyRider, RiderPosition, RoomBroadcaster } from './ports.js';

class FakeStore implements LocationStore {
  last_ = new Map<string, RiderLocation>();
  active = new Map<string, string>();
  write(riderId: string, fix: RiderLocation): Promise<boolean> {
    const prev = this.last_.get(riderId);
    if (prev && prev.ts >= fix.ts) return Promise.resolve(false);
    this.last_.set(riderId, fix);
    return Promise.resolve(true);
  }
  last(riderId: string): Promise<RiderPosition | null> {
    return Promise.resolve(this.last_.get(riderId) ?? null);
  }
  near(): Promise<NearbyRider[]> {
    return Promise.resolve([...this.last_.keys()].map((riderId) => ({ riderId, distanceM: 1 })));
  }
  activeOrderOf(riderId: string): Promise<string | null> {
    return Promise.resolve(this.active.get(riderId) ?? null);
  }
  setActiveOrder(riderId: string, orderId: string | null): Promise<void> {
    if (orderId) this.active.set(riderId, orderId);
    else this.active.delete(riderId);
    return Promise.resolve();
  }
}

class FakeRooms implements RoomBroadcaster {
  locations: RiderLocationBroadcast[] = [];
  statuses: string[] = [];
  riderLocation(p: RiderLocationBroadcast): void {
    this.locations.push(p);
  }
  orderStatus(p: { orderId: string; status: string }): void {
    this.statuses.push(`${p.orderId}:${p.status}`);
  }
}

const now = 1_800_000_000_000;
const fix = (ts: number): RiderLocation => ({ lat: 6.5, lng: 3.4, heading: 90, ts });

describe('LiveTrackingService', () => {
  const setup = () => {
    const store = new FakeStore();
    const rooms = new FakeRooms();
    return { store, rooms, svc: new DefaultLiveTrackingService(store, rooms, () => now) };
  };

  it('stores the newest fresh fix but fans out only when the rider has an active order', async () => {
    const { svc, rooms } = setup();
    expect(await svc.ingest('r1', [fix(now - 2_000), fix(now - 1_000)])).toEqual({
      accepted: 2,
      rejected: 0,
    });
    expect(rooms.locations).toHaveLength(0);
    await svc.startTrip('r1', 'o1');
    await svc.ingest('r1', [fix(now)]);
    expect(rooms.locations).toEqual([{ riderId: 'r1', orderId: 'o1', ...fix(now) }]);
    expect(await svc.positionOf('r1')).toEqual(fix(now));
  });

  it('rejects stale fixes and ignores out-of-order ones', async () => {
    const { svc, rooms } = setup();
    await svc.startTrip('r1', 'o1');
    expect(await svc.ingest('r1', [fix(now - 10 * 60_000)])).toEqual({ accepted: 0, rejected: 1 });
    await svc.ingest('r1', [fix(now)]);
    await svc.ingest('r1', [fix(now - 1_000)]);
    expect(rooms.locations).toHaveLength(1);
  });

  it('stops sharing after the trip ends; exposes nearby riders and status updates', async () => {
    const { svc, rooms } = setup();
    await svc.startTrip('r1', 'o1');
    await svc.endTrip('r1');
    await svc.ingest('r1', [fix(now)]);
    expect(rooms.locations).toHaveLength(0);
    expect(await svc.ridersNear(6.5, 3.4, 1000, 5)).toEqual([{ riderId: 'r1', distanceM: 1 }]);
    svc.publishOrderStatus('o1', 'PICKED_UP', new Date(now));
    expect(rooms.statuses).toEqual(['o1:PICKED_UP']);
  });
});
