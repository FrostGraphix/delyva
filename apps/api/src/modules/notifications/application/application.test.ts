import type { InboxNotification, NotificationJob, NotificationPreference } from '@delyva/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.js';
import {
  GetPreferences,
  RegisterDevice,
  UpdatePreferences,
} from './device-and-preferences.use-cases.js';
import { HandleDomainEvent } from './handle-domain-event.use-case.js';
import { decodeCursor, encodeCursor, ListInbox, MarkNotificationRead } from './inbox.use-cases.js';
import { NotifyUser } from './notify-user.use-case.js';
import type {
  Clock,
  DeliveryQueue,
  DeviceRepository,
  InboxRepository,
  NewInboxItem,
  PreferenceRepository,
  PushDevice,
  RecipientDirectory,
} from './ports.js';

const U1 = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';
const U2 = '1b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e22';
const ORDER = '7a1c3b9e-1111-4f5e-9d2a-0a6a1c1f0e11';

class FakeInbox implements InboxRepository {
  rows: (NewInboxItem & { readAt: Date | null })[] = [];
  insert(item: NewInboxItem): Promise<boolean> {
    if (this.rows.some((r) => r.userId === item.userId && r.dedupeKey === item.dedupeKey)) {
      return Promise.resolve(false);
    }
    this.rows.push({ ...item, readAt: null });
    return Promise.resolve(true);
  }
  list(
    userId: string,
    opts: { limit: number; before: { createdAt: Date; id: string } | null; unreadOnly: boolean },
  ): Promise<InboxNotification[]> {
    const rows = this.rows
      .filter((r) => r.userId === userId && (!opts.unreadOnly || !r.readAt))
      .filter((r) => !opts.before || r.createdAt < opts.before.createdAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, opts.limit);
    return Promise.resolve(
      rows.map((r) => ({
        id: r.id,
        template: r.template,
        title: r.title,
        body: r.body,
        data: { ...r.data },
        readAt: r.readAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
    );
  }
  unreadCount(userId: string): Promise<number> {
    return Promise.resolve(this.rows.filter((r) => r.userId === userId && !r.readAt).length);
  }
  markRead(userId: string, id: string, at: Date): Promise<boolean> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    if (row) row.readAt ??= at;
    return Promise.resolve(Boolean(row));
  }
}

class FakeDevices implements DeviceRepository {
  rows: PushDevice[] = [];
  upsert(d: PushDevice): Promise<void> {
    this.rows = [...this.rows.filter((r) => r.pushToken !== d.pushToken), d];
    return Promise.resolve();
  }
  activeFor(userId: string): Promise<PushDevice[]> {
    return Promise.resolve(this.rows.filter((r) => r.userId === userId));
  }
}

class FakePrefs implements PreferenceRepository {
  rows = new Map<string, NotificationPreference[]>();
  get(userId: string): Promise<NotificationPreference[]> {
    return Promise.resolve(this.rows.get(userId) ?? []);
  }
  put(userId: string, prefs: readonly NotificationPreference[]): Promise<void> {
    const merged = new Map(
      [...(this.rows.get(userId) ?? []), ...prefs].map((p) => [`${p.category}:${p.channel}`, p]),
    );
    this.rows.set(userId, [...merged.values()]);
    return Promise.resolve();
  }
}

class FakeQueue implements DeliveryQueue {
  jobs = new Map<string, NotificationJob>();
  enqueue(jobId: string, job: NotificationJob): Promise<void> {
    if (!this.jobs.has(jobId)) this.jobs.set(jobId, job);
    return Promise.resolve();
  }
}

let t = 0;
let n = 0;
const clock: Clock = {
  now: () => new Date(Date.UTC(2026, 10, 19, 12, 0, t++)),
  uuid: () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`,
};
const directory: RecipientDirectory = {
  phoneOf: (id) => Promise.resolve(id === U1 ? '+2348031234567' : null),
};

describe('notifications application', () => {
  let inbox: FakeInbox;
  let devices: FakeDevices;
  let prefs: FakePrefs;
  let queue: FakeQueue;
  let notify: NotifyUser;

  beforeEach(() => {
    inbox = new FakeInbox();
    devices = new FakeDevices();
    prefs = new FakePrefs();
    queue = new FakeQueue();
    notify = new NotifyUser({ inbox, devices, preferences: prefs, directory, queue, clock });
  });

  const register = (userId: string, token: string) =>
    new RegisterDevice(devices, clock).execute({
      userId,
      deviceId: `dev-${token}`,
      pushToken: `ExponentPushToken[${token}]`,
      platform: 'android',
      locale: 'en',
    });

  it('writes the inbox and enqueues push when the user has a device', async () => {
    await register(U1, 'aaaaaaaaaaaa');
    const res = await notify.execute({
      userId: U1,
      template: 'order.placed',
      params: { orderRef: 'AB12' },
      data: { orderId: ORDER },
      sourceEventId: 'evt1',
    });
    expect(res).toEqual({ channels: ['in_app', 'push'], duplicate: false });
    expect(inbox.rows[0]?.body).toBe('We have sent order AB12 to the vendor.');
    const job = queue.jobs.get(`evt1_${U1}_push`);
    expect(job).toMatchObject({ kind: 'push', tokens: ['ExponentPushToken[aaaaaaaaaaaa]'] });
  });

  it('skips push without devices and honours opt-outs; SMS only when opted in and a phone exists', async () => {
    await prefs.put(U1, [
      { category: 'order_updates', channel: 'in_app', enabled: false },
      { category: 'order_updates', channel: 'sms', enabled: true },
    ]);
    const res = await notify.execute({
      userId: U1,
      template: 'order.rider_assigned',
      params: { orderRef: 'X' },
      data: {},
      sourceEventId: 'evt2',
    });
    expect(res.channels).toEqual(['sms']);
    expect(inbox.rows).toHaveLength(0);
    expect(queue.jobs.get(`evt2_${U1}_sms`)).toMatchObject({
      kind: 'sms',
      phone: '+2348031234567',
    });
    await prefs.put(U2, [{ category: 'order_updates', channel: 'sms', enabled: true }]);
    const noPhone = await notify.execute({
      userId: U2,
      template: 'order.rider_assigned',
      params: { orderRef: 'X' },
      data: {},
      sourceEventId: 'evt3',
    });
    expect(noPhone.channels).toEqual(['in_app']);
  });

  it('is idempotent per (event, user)', async () => {
    await register(U1, 'bbbbbbbbbbbb');
    const cmd = {
      userId: U1,
      template: 'account.welcome' as const,
      params: {},
      data: {},
      sourceEventId: 'e',
    };
    await notify.execute(cmd);
    const again = await notify.execute(cmd);
    expect(again.duplicate).toBe(true);
    expect(inbox.rows).toHaveLength(1);
    expect(queue.jobs.size).toBe(1);
  });

  it('handles domain events: welcome, order placeholder, unmapped and invalid payloads', async () => {
    const handler = new HandleDomainEvent(notify);
    await expect(
      handler.execute({ id: 'a', type: 'identity.user.registered', payload: { userId: U1 } }),
    ).resolves.toMatchObject({ status: 'notified' });
    await expect(
      handler.execute({
        id: 'b',
        type: 'ordering.order.placed',
        payload: { orderId: ORDER, customerId: U2 },
      }),
    ).resolves.toMatchObject({ status: 'notified' });
    expect(inbox.rows.map((r) => r.template)).toEqual(['account.welcome', 'order.placed']);
    await expect(
      handler.execute({ id: 'c', type: 'ordering.order.placed', payload: { orderId: 'x' } }),
    ).resolves.toEqual({ status: 'ignored', reason: 'invalid_payload' });
    await expect(
      handler.execute({ id: 'd', type: 'identity.user.registered', payload: {} }),
    ).resolves.toEqual({ status: 'ignored', reason: 'invalid_payload' });
    await expect(
      handler.execute({ id: 'e', type: 'catalog.menu.updated', payload: {} }),
    ).resolves.toEqual({ status: 'ignored', reason: 'unmapped_type' });
  });

  it('lists the inbox newest first with a cursor, and marks read only for the owner', async () => {
    for (const id of ['e1', 'e2', 'e3']) {
      await notify.execute({
        userId: U1,
        template: 'account.welcome',
        params: {},
        data: {},
        sourceEventId: id,
      });
    }
    const list = new ListInbox(inbox);
    const first = await list.execute(U1, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.unreadCount).toBe(3);
    expect(first.nextCursor).not.toBeNull();
    const second = await list.execute(U1, { limit: 2, cursor: first.nextCursor ?? '' });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const target = first.items[0]?.id ?? '';
    const mark = new MarkNotificationRead(inbox, clock);
    await expect(mark.execute(U2, target)).rejects.toMatchObject({ code: 'not_found' });
    await mark.execute(U1, target);
    expect((await list.execute(U1, { limit: 5, unreadOnly: true })).items).toHaveLength(2);
  });

  it('rejects malformed cursors and round-trips valid ones', () => {
    expect(() => decodeCursor('bm9wZQ')).toThrow(AppError);
    expect(decodeCursor(encodeCursor('2026-11-19T12:00:00.000Z', U1))).toEqual({
      createdAt: new Date('2026-11-19T12:00:00.000Z'),
      id: U1,
    });
  });

  it('returns effective preferences and dedupes updates', async () => {
    const updated = await new UpdatePreferences(prefs).execute(U1, [
      { category: 'promotions', channel: 'push', enabled: false },
      { category: 'promotions', channel: 'push', enabled: true },
    ]);
    expect(updated.preferences).toContainEqual({
      category: 'promotions',
      channel: 'push',
      enabled: true,
    });
    expect((await new GetPreferences(prefs).execute(U2)).preferences).toHaveLength(12);
  });
});
