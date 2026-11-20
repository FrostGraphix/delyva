import { Queue, Worker } from 'bullmq';
import { pino } from 'pino';
import { z } from 'zod';
import {
  ExpoPushChannel,
  LogChannel,
  TermiiSmsChannel,
  WhatsAppStubChannel,
} from './jobs/channels.js';
import type { DeliveryChannels } from './jobs/notification.job.js';
import { startNotificationWorker } from './jobs/notification.worker.js';
import {
  httpInternalApi,
  PAYMENT_QUEUES,
  PAYMENT_SCHEDULES,
  processPayoutBatch,
  processReconciliation,
} from './jobs/payments.jobs.js';

const env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    LOG_LEVEL: z.string().default('info'),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
    BULLMQ_PREFIX: z.string().min(1).default('bull'),
    PUSH_PROVIDER: z.enum(['expo', 'log']).default('log'),
    EXPO_PUSH_URL: z.url().default('https://exp.host/--/api/v2/push/send'),
    EXPO_ACCESS_TOKEN: z.string().optional(),
    SMS_PROVIDER: z.enum(['termii', 'log']).default('log'),
    TERMII_API_KEY: z.string().default(''),
    TERMII_SENDER_ID: z.string().default('Delyva'),
    TERMII_BASE_URL: z.url().default('https://api.ng.termii.com'),
    API_INTERNAL_URL: z.url().optional(),
    INTERNAL_JOBS_TOKEN: z.string().optional(),
  })
  .refine(
    (e) =>
      e.NODE_ENV !== 'production' || (e.PUSH_PROVIDER === 'expo' && e.SMS_PROVIDER === 'termii'),
    {
      message: 'production requires PUSH_PROVIDER=expo and SMS_PROVIDER=termii',
    },
  )
  .parse(process.env);

const logger = pino({ level: env.LOG_LEVEL, base: { service: 'delyva-workers' } });

const channels: DeliveryChannels = {
  push:
    env.PUSH_PROVIDER === 'expo'
      ? new ExpoPushChannel({ url: env.EXPO_PUSH_URL, accessToken: env.EXPO_ACCESS_TOKEN })
      : new LogChannel(logger, 'push'),
  sms:
    env.SMS_PROVIDER === 'termii'
      ? new TermiiSmsChannel({
          apiKey: env.TERMII_API_KEY,
          senderId: env.TERMII_SENDER_ID,
          baseUrl: env.TERMII_BASE_URL,
        })
      : new LogChannel(logger, 'sms'),
  whatsapp: new WhatsAppStubChannel(),
};

const running = startNotificationWorker({
  redisUrl: env.REDIS_URL,
  prefix: env.BULLMQ_PREFIX,
  channels,
  logger,
  concurrency: env.WORKER_CONCURRENCY,
});
running.worker.on('ready', () => {
  logger.info({ queue: running.worker.name }, 'worker ready');
});

const paymentWorkers: Worker[] = [];
if (env.API_INTERNAL_URL && env.INTERNAL_JOBS_TOKEN) {
  const api = httpInternalApi(env.API_INTERNAL_URL, env.INTERNAL_JOBS_TOKEN);
  const connection = { url: env.REDIS_URL };
  const jobs = [
    { queue: PAYMENT_QUEUES.payouts, schedule: PAYMENT_SCHEDULES.payouts, run: processPayoutBatch },
    {
      queue: PAYMENT_QUEUES.reconciliation,
      schedule: PAYMENT_SCHEDULES.reconciliation,
      run: processReconciliation,
    },
  ];
  for (const job of jobs) {
    const queue = new Queue(job.queue, { connection });
    await queue.upsertJobScheduler(
      job.queue,
      { ...job.schedule },
      { name: job.queue, opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } } },
    );
    await queue.close();
    paymentWorkers.push(
      new Worker(job.queue, () => job.run(new Date(), api), { connection, concurrency: 1 }),
    );
  }
  logger.info({ queues: Object.values(PAYMENT_QUEUES) }, 'payment schedulers registered');
} else {
  logger.warn(
    'API_INTERNAL_URL/INTERNAL_JOBS_TOKEN not set: payout and reconciliation jobs disabled',
  );
}

async function shutdown(): Promise<void> {
  await Promise.all([running.close(), ...paymentWorkers.map((w) => w.close())]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
