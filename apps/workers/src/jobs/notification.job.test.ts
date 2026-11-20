import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';
import { pino } from 'pino';
import { ExpoPushChannel, LogChannel, TermiiSmsChannel, WhatsAppStubChannel } from './channels.js';
import {
  type DeliveryChannels,
  isFinalFailure,
  jitteredBackoff,
  PermanentDeliveryError,
  processNotification,
  toDeadLetter,
} from './notification.job.js';

const id = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';
const pushJob = {
  kind: 'push' as const,
  notificationId: id,
  userId: id,
  tokens: ['ExponentPushToken[abcdefghij1234]'],
  title: 'Order placed',
  body: 'We have sent order A1 to the vendor.',
  data: { orderId: id },
};

const okChannels = (sent: string[] = []): DeliveryChannels => ({
  push: { send: (j) => (sent.push(`push:${j.tokens.length}`), Promise.resolve()) },
  sms: { send: (_p, t) => (sent.push(`sms:${t}`), Promise.resolve()) },
  whatsapp: new WhatsAppStubChannel(),
});

const fakeFetch =
  (status: number, body: unknown = {}): typeof fetch =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('processNotification', () => {
  it('routes push and sms jobs to their channel', async () => {
    const sent: string[] = [];
    await expect(processNotification(pushJob, okChannels(sent))).resolves.toMatchObject({
      delivered: true,
      kind: 'push',
    });
    await processNotification(
      { kind: 'sms', notificationId: id, userId: id, phone: '+2348031234567', text: 'hi' },
      okChannels(sent),
    );
    expect(sent).toEqual(['push:1', 'sms:hi']);
  });

  it('turns invalid payloads into unrecoverable errors (straight to DLQ)', async () => {
    await expect(processNotification({ kind: 'push' }, okChannels())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
  });

  it('turns permanent provider errors into unrecoverable errors, keeps transient ones retryable', async () => {
    const channels = okChannels();
    const permanent = {
      ...channels,
      push: { send: () => Promise.reject(new PermanentDeliveryError('bad')) },
    };
    await expect(processNotification(pushJob, permanent)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    const transient = { ...channels, push: { send: () => Promise.reject(new Error('timeout')) } };
    await expect(processNotification(pushJob, transient)).rejects.not.toBeInstanceOf(
      UnrecoverableError,
    );
  });
});

describe('jitteredBackoff', () => {
  it('grows exponentially, is capped, and is jittered below the ceiling', () => {
    expect(jitteredBackoff(1, () => 0.999)).toBe(1_998);
    expect(jitteredBackoff(3, () => 0.5)).toBe(4_000);
    expect(jitteredBackoff(30, () => 0.999)).toBeLessThan(300_000);
    expect(jitteredBackoff(2, () => 0)).toBe(0);
  });
});

describe('dead-letter decisions', () => {
  const job = { id: 'j1', name: 'push', data: pushJob, attemptsMade: 2, opts: { attempts: 5 } };

  it('is final only when attempts are exhausted or the error is unrecoverable', () => {
    expect(isFinalFailure(job, new Error('x'))).toBe(false);
    expect(isFinalFailure({ ...job, attemptsMade: 5 }, new Error('x'))).toBe(true);
    expect(isFinalFailure(job, new UnrecoverableError('x'))).toBe(true);
  });

  it('builds a dead-letter record', () => {
    const rec = toDeadLetter(job, new Error('boom'), new Date('2026-11-19T00:00:00Z'));
    expect(rec).toMatchObject({ jobId: 'j1', failedReason: 'boom', queue: 'notifications' });
  });
});

describe('ExpoPushChannel', () => {
  const url = 'https://push.example.test/send';

  it('accepts ok tickets', async () => {
    const ch = new ExpoPushChannel({ url }, fakeFetch(200, { data: [{ status: 'ok' }] }));
    await expect(ch.send(pushJob)).resolves.toBeUndefined();
  });

  it('treats DeviceNotRegistered on every token as permanent', async () => {
    const ch = new ExpoPushChannel(
      { url },
      fakeFetch(200, { data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
    );
    await expect(ch.send(pushJob)).rejects.toBeInstanceOf(PermanentDeliveryError);
  });

  it('retries on 5xx and on transient ticket errors', async () => {
    await expect(
      new ExpoPushChannel({ url }, fakeFetch(503)).send(pushJob),
    ).rejects.not.toBeInstanceOf(PermanentDeliveryError);
    const ch = new ExpoPushChannel(
      { url },
      fakeFetch(200, { data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }] }),
    );
    await expect(ch.send(pushJob)).rejects.not.toBeInstanceOf(PermanentDeliveryError);
  });

  it('treats 4xx request rejections as permanent', async () => {
    await expect(new ExpoPushChannel({ url }, fakeFetch(400)).send(pushJob)).rejects.toBeInstanceOf(
      PermanentDeliveryError,
    );
  });
});

describe('TermiiSmsChannel', () => {
  const cfg = { apiKey: 'k', senderId: 'Delyva', baseUrl: 'https://sms.example.test' };

  it('sends and classifies failures', async () => {
    await expect(
      new TermiiSmsChannel(cfg, fakeFetch(200)).send('+2348031234567', 'hi'),
    ).resolves.toBeUndefined();
    await expect(
      new TermiiSmsChannel(cfg, fakeFetch(401)).send('+2348031234567', 'hi'),
    ).rejects.toBeInstanceOf(PermanentDeliveryError);
    await expect(
      new TermiiSmsChannel(cfg, fakeFetch(502)).send('+2348031234567', 'hi'),
    ).rejects.not.toBeInstanceOf(PermanentDeliveryError);
  });
});

describe('stub and log channels', () => {
  it('whatsapp stub fails permanently; log channel records metadata only', async () => {
    await expect(new WhatsAppStubChannel().send()).rejects.toBeInstanceOf(PermanentDeliveryError);
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (l: string) => lines.push(l) });
    const ch = new LogChannel(logger, 'push');
    await ch.send(pushJob);
    await ch.send();
    expect(lines[0]).toContain(id);
    expect(lines.join('')).not.toContain('ExponentPushToken');
  });

  it('sends the Expo access token when configured', async () => {
    let auth: string | null = null;
    const ch = new ExpoPushChannel(
      { url: 'https://push.example.test', accessToken: 't0k' },
      (_u, init) => {
        auth = new Headers(init?.headers).get('authorization');
        return Promise.resolve(new Response(JSON.stringify({ data: [{ status: 'ok' }] })));
      },
    );
    await ch.send(pushJob);
    expect(auth).toBe('Bearer t0k');
  });
});
