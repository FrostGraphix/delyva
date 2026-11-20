import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WhatsAppStubChannel } from './channels.js';
import { type DeliveryChannels, QUEUES } from './notification.job.js';
import { type NotificationWorker, startNotificationWorker } from './notification.worker.js';

/**
 * Integration: BullMQ against the real Redis from infra/docker-compose.yml (db 13, own prefix).
 * Skips with a message when Redis is unreachable; never fake-passes.
 */
const REDIS_URL = process.env.TEST_NOTIFY_REDIS_URL ?? 'redis://127.0.0.1:56379/13';
const PREFIX = `test-notify-${randomUUID().slice(0, 8)}`;

async function redisUp(): Promise<boolean> {
  const r = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  try {
    await r.connect();
    await r.ping();
    return true;
  } catch {
    return false;
  } finally {
    r.disconnect();
  }
}

const available = await redisUp();
if (!available) process.stderr.write('\n[SKIP] worker integration tests: Redis not reachable.\n\n');

const id = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';
const smsJob = { kind: 'sms', notificationId: id, userId: id, phone: '+2348031234567', text: 'hi' };

async function waitFor<T>(fn: () => Promise<T | undefined>, ms = 15_000): Promise<T> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await fn();
    if (v !== undefined) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out');
}

describe.skipIf(!available)('notification worker (integration: BullMQ + Redis)', () => {
  let producer: Queue;
  let running: NotificationWorker;
  let smsCalls = 0;
  let failUntil = 0;
  const backoffCalls: number[] = [];

  beforeAll(() => {
    const channels: DeliveryChannels = {
      push: { send: () => Promise.reject(new Error('push provider down')) },
      sms: {
        send: () => {
          smsCalls++;
          return smsCalls <= failUntil
            ? Promise.reject(new Error('termii 502'))
            : Promise.resolve();
        },
      },
      whatsapp: new WhatsAppStubChannel(),
    };
    producer = new Queue(QUEUES.delivery, { connection: { url: REDIS_URL }, prefix: PREFIX });
    running = startNotificationWorker({
      redisUrl: REDIS_URL,
      prefix: PREFIX,
      channels,
      logger: pino({ level: 'silent' }),
      concurrency: 2,
      backoff: (n) => (backoffCalls.push(n), 20),
    });
  });

  afterAll(async () => {
    await running.worker.close();
    await producer.obliterate({ force: true });
    await running.deadLetters.obliterate({ force: true });
    await running.deadLetters.close();
    await producer.close();
  });

  const opts = { attempts: 3, backoff: { type: 'jittered' } };

  it('retries transient failures with the custom backoff and then succeeds', async () => {
    failUntil = 2;
    const job = await producer.add('sms', smsJob, { ...opts, jobId: 'retry-ok' });
    const state = await waitFor(async () => {
      const s = await job.getState();
      return s === 'completed' ? s : undefined;
    });
    expect(state).toBe('completed');
    expect(smsCalls).toBe(3);
    expect(backoffCalls).toEqual([1, 2]);
  });

  it('moves a job to the DLQ after exhausting attempts', async () => {
    await producer.add(
      'push',
      {
        kind: 'push',
        notificationId: id,
        userId: id,
        tokens: ['ExponentPushToken[abcdefghij1234]'],
        title: 't',
        body: 'b',
        data: {},
      },
      { ...opts, jobId: 'exhaust' },
    );
    const dead = await waitFor(
      async () => (await running.deadLetters.getJob('dlq_exhaust')) ?? undefined,
    );
    expect(dead.data).toMatchObject({
      jobId: 'exhaust',
      attemptsMade: 3,
      failedReason: 'push provider down',
    });
  });

  it('dead-letters invalid payloads immediately without retrying', async () => {
    await producer.add('sms', { kind: 'sms', bogus: true }, { ...opts, jobId: 'invalid' });
    const dead = await waitFor(
      async () => (await running.deadLetters.getJob('dlq_invalid')) ?? undefined,
    );
    expect(dead.data).toMatchObject({
      attemptsMade: 1,
      failedReason: 'invalid notification job payload',
    });
  });
});
