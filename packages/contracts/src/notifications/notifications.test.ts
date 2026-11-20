import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../openapi.js';
import {
  ListNotificationsQuerySchema,
  NotificationJobSchema,
  RegisterDeviceSchema,
} from './index.js';
import { RiderLocationBatchSchema, RiderLocationSchema } from '../realtime/index.js';

const uuid = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';

describe('notification contracts', () => {
  it('accepts an Expo push token and defaults the locale to en', () => {
    const parsed = RegisterDeviceSchema.parse({
      pushToken: 'ExponentPushToken[abcdefghij1234]',
      platform: 'android',
    });
    expect(parsed.locale).toBe('en');
  });

  it('rejects non-Expo tokens and unknown fields', () => {
    expect(RegisterDeviceSchema.safeParse({ pushToken: 'fcm:xyz', platform: 'ios' }).success).toBe(
      false,
    );
    expect(
      RegisterDeviceSchema.safeParse({
        pushToken: 'ExpoPushToken[abcdefghij1234]',
        platform: 'ios',
        deviceId: 'spoofed-device',
      }).success,
    ).toBe(false);
  });

  it('coerces list query params and caps the page size', () => {
    expect(ListNotificationsQuerySchema.parse({ limit: '5', unreadOnly: 'true' })).toEqual({
      limit: 5,
      unreadOnly: true,
    });
    expect(ListNotificationsQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('discriminates delivery jobs by kind', () => {
    const job = NotificationJobSchema.parse({
      kind: 'sms',
      notificationId: uuid,
      userId: uuid,
      phone: '+2348031234567',
      text: 'hi',
    });
    expect(job.kind).toBe('sms');
    expect(
      NotificationJobSchema.safeParse({ kind: 'push', notificationId: uuid, userId: uuid })
        .success,
    ).toBe(false);
  });
});

describe('realtime contracts', () => {
  it('validates coordinates and heading ranges', () => {
    expect(RiderLocationSchema.parse({ lat: 6.5, lng: 3.4, ts: 1 }).heading).toBeNull();
    expect(RiderLocationSchema.safeParse({ lat: 91, lng: 3.4, ts: 1 }).success).toBe(false);
    expect(RiderLocationSchema.safeParse({ lat: 6, lng: 3, heading: 360, ts: 1 }).success).toBe(
      false,
    );
  });

  it('bounds batch size', () => {
    const point = { lat: 6.5, lng: 3.4, ts: 1 };
    expect(RiderLocationBatchSchema.safeParse({ points: [] }).success).toBe(false);
    expect(
      RiderLocationBatchSchema.safeParse({ points: Array.from({ length: 51 }, () => point) })
        .success,
    ).toBe(false);
  });
});

describe('OpenAPI for notifications and realtime', () => {
  const doc = buildOpenApiDocument('0.0.0') as {
    paths: Record<
      string,
      Record<string, { parameters?: { name: string; in: string }[]; security?: unknown[] }>
    >;
  };

  it('documents bearer auth, path and query parameters', () => {
    const read = doc.paths['/v1/notifications/{id}/read']?.post;
    expect(read?.security).toEqual([{ bearerAuth: [] }]);
    expect(read?.parameters).toEqual([expect.objectContaining({ name: 'id', in: 'path' })]);
    const list = doc.paths['/v1/notifications']?.get;
    expect(list?.parameters?.map((p) => p.name)).toEqual(['limit', 'cursor', 'unreadOnly']);
    expect(doc.paths['/v1/notifications/preferences']?.put).toBeDefined();
    expect(doc.paths['/v1/devices']?.post).toBeDefined();
    expect(doc.paths['/v1/riders/me/locations']?.post).toBeDefined();
  });
});
