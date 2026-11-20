import { describe, expect, it } from 'vitest';
import { ApiError } from './client.js';
import { NotificationsClient } from './notifications.js';
import { RealtimeClient } from './realtime.js';

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('NotificationsClient', () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const client = (status: number, body: unknown) =>
    new NotificationsClient({
      baseUrl: 'https://api.example.test',
      accessToken: () => 'tok',
      fetch: (url, init) => {
        calls.push({ url: String(url), init });
        return Promise.resolve(json(status, body));
      },
    });

  it('lists notifications with query params and a bearer token', async () => {
    const page = { items: [], nextCursor: null, unreadCount: 0 };
    await expect(
      client(200, page).listNotifications({ limit: 5, unreadOnly: 'true' }),
    ).resolves.toEqual(page);
    const last = calls.at(-1);
    expect(last?.url).toBe('https://api.example.test/v1/notifications?limit=5&unreadOnly=true');
    expect(new Headers(last?.init?.headers).get('authorization')).toBe('Bearer tok');
  });

  it('marks read, manages preferences, registers devices and posts locations', async () => {
    await client(204, undefined).markNotificationRead('abc');
    expect(calls.at(-1)?.url).toBe('https://api.example.test/v1/notifications/abc/read');
    const prefs = { preferences: [{ category: 'account', channel: 'push', enabled: true }] };
    await expect(client(200, prefs).getNotificationPreferences()).resolves.toEqual(prefs);
    await expect(client(200, prefs).updateNotificationPreferences(prefs as never)).resolves.toEqual(
      prefs,
    );
    const reg = {
      deviceId: 'd1',
      platform: 'ios',
      locale: 'en',
      registeredAt: '2026-11-19T00:00:00.000Z',
    };
    await expect(
      client(200, reg).registerDevice({
        pushToken: 'ExpoPushToken[abcdefghij12]',
        platform: 'ios',
      }),
    ).resolves.toEqual(reg);
    await expect(
      client(202, { accepted: 1, rejected: 0 }).postRiderLocations({
        points: [{ lat: 6, lng: 3, ts: 1 }],
      }),
    ).resolves.toEqual({ accepted: 1, rejected: 0 });
  });

  it('throws ApiError with the problem on failure', async () => {
    await expect(
      client(401, {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        code: 'unauthorized',
      }).listNotifications(),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('RealtimeClient', () => {
  it('passes the token in the handshake and resolves acks (with timeout fallback)', async () => {
    const handlers = new Map<string, (...a: unknown[]) => void>();
    let authPayload: unknown;
    const fake = {
      emit: (event: string, _p: unknown, cb: (r: unknown) => void) => {
        if (event !== 'order:leave') cb({ ok: true });
      },
      on: (e: string, h: (...a: unknown[]) => void) => handlers.set(e, h),
      off: (e: string) => handlers.delete(e),
      disconnect: () => undefined,
    };
    const rc = new RealtimeClient({
      url: 'https://api.example.test',
      accessToken: () => 'tok',
      ackTimeoutMs: 10,
      connect: ((_url: string, opts: { auth: (cb: (d: unknown) => void) => void }) => {
        opts.auth((d) => (authPayload = d));
        return fake;
      }) as never,
    });
    expect(authPayload).toEqual({ token: 'tok' });
    await expect(rc.sendLocation({ lat: 6, lng: 3, ts: 1 })).resolves.toEqual({ ok: true });
    await expect(rc.joinOrder('o1')).resolves.toEqual({ ok: true });
    await expect(rc.leaveOrder('o1')).resolves.toEqual({ ok: false, code: 'internal_error' });
    const off = rc.onRiderLocation(() => undefined);
    const off2 = rc.onOrderStatus(() => undefined);
    expect(handlers.size).toBe(2);
    off();
    off2();
    expect(handlers.size).toBe(0);
    rc.close();
  });
});
