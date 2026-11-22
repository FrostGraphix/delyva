import type { Problem, Trip } from '@delyva/contracts';
import { ApiError } from '@delyva/sdk';
import { type QueuedTripAction, type QueueStorage, TripActionQueue } from './trip-queue';

const memory = (): QueueStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => Promise.resolve(data.get(k) ?? null),
    setItem: (k, v) => {
      data.set(k, v);
      return Promise.resolve();
    },
  };
};

const action = (id: string, tripId = 'trip-1'): QueuedTripAction => ({
  id,
  tripId,
  action: 'picked-up',
  body: {},
  queuedAt: 1,
});

const trip = (status: Trip['status']): Trip => ({
  id: 'trip-1',
  orderId: 'order-1',
  riderId: 'rider-1',
  status,
  pickup: { lat: 6.4, lng: 3.4 },
  dropoff: { lat: 6.5, lng: 3.5 },
  assignment: 'offer',
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
});

const problem = (status: number, code: Problem['code']): ApiError =>
  new ApiError({ type: 'about:blank', title: 'x', status, code });

describe('TripActionQueue', () => {
  it('keeps actions queued while offline and replays them in order with the same keys', async () => {
    // Arrange
    const storage = memory();
    let online = false;
    const sentKeys: string[] = [];
    const queue = new TripActionQueue(storage, (a) => {
      if (!online) return Promise.reject(new TypeError('Network request failed'));
      sentKeys.push(a.id);
      return Promise.resolve(trip('picked_up'));
    });
    await queue.enqueue(action('key-a'));
    await queue.enqueue(action('key-b'));

    // Act
    const offline = await queue.replay();
    online = true;
    const back = await queue.replay();

    // Assert
    expect(offline).toEqual({ sent: [], rejected: [], remaining: 2 });
    expect(sentKeys).toEqual(['key-a', 'key-b']);
    expect(back.remaining).toBe(0);
    expect(await queue.list()).toEqual([]);
  });

  it('persists the queue so a new instance (app restart) replays it', async () => {
    // Arrange
    const storage = memory();
    const first = new TripActionQueue(storage, () => Promise.reject(new TypeError('offline')));
    await first.enqueue(action('key-a'));
    const sent: string[] = [];
    const second = new TripActionQueue(storage, (a) => {
      sent.push(a.id);
      return Promise.resolve(trip('picked_up'));
    });

    // Act
    const result = await second.replay();

    // Assert
    expect(sent).toEqual(['key-a']);
    expect(result.sent).toHaveLength(1);
  });

  it('drops actions the API refuses for good (4xx) and continues with the rest', async () => {
    // Arrange
    const storage = memory();
    const queue = new TripActionQueue(storage, (a) =>
      a.id === 'bad'
        ? Promise.reject(problem(422, 'validation_failed'))
        : Promise.resolve(trip('picked_up')),
    );
    await queue.enqueue(action('bad'));
    await queue.enqueue(action('good'));

    // Act
    const result = await queue.replay();

    // Assert
    expect(result.rejected.map((r) => r.action.id)).toEqual(['bad']);
    expect(result.sent.map((s) => s.action.id)).toEqual(['good']);
    expect(result.remaining).toBe(0);
  });

  it('stops at a 5xx and keeps that action and later ones', async () => {
    // Arrange
    const storage = memory();
    const queue = new TripActionQueue(storage, () =>
      Promise.reject(problem(503, 'internal_error')),
    );
    await queue.enqueue(action('a'));
    await queue.enqueue(action('b'));

    // Act
    const result = await queue.replay();

    // Assert
    expect(result.remaining).toBe(2);
    expect((await queue.list()).map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('ignores a duplicate enqueue of the same idempotency key', async () => {
    // Arrange
    const queue = new TripActionQueue(memory(), () => Promise.resolve(trip('picked_up')));

    // Act
    await queue.enqueue(action('same'));
    await queue.enqueue(action('same'));

    // Assert
    expect(await queue.list()).toHaveLength(1);
  });

  it('treats corrupt storage as an empty queue', async () => {
    // Arrange
    const storage = memory();
    storage.data.set('delyva.rider.trip-queue.v1', '{not json');
    const queue = new TripActionQueue(storage, () => Promise.resolve(trip('picked_up')));

    // Act + Assert
    expect(await queue.list()).toEqual([]);
  });
});
