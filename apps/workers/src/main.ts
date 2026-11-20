import { Queue, Worker } from 'bullmq';
import { pino } from 'pino';
import { z } from 'zod';
import { type NotificationChannel, processNotification, QUEUES } from './jobs/notification.job.js';
import {
  httpInternalApi,
  PAYMENT_QUEUES,
  PAYMENT_SCHEDULES,
  processPayoutBatch,
  processReconciliation,
} from './jobs/payments.jobs.js';

const env = z
  .object({
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    LOG_LEVEL: z.string().default('info'),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
    API_INTERNAL_URL: z.url().optional(),
    INTERNAL_JOBS_TOKEN: z.string().optional(),
  })
  .parse(process.env);

const logger = pino({ level: env.LOG_LEVEL, base: { service: 'delyva-workers' } });

// DEBT(notifications): log-only channel — push/SMS adapters arrive in Phase 1 — implement FCM/Termii channels.
const channel: NotificationChannel = {
  send: (_userId, template) => {
    logger.info({ template }, 'notification delivered (stub)');
    return Promise.resolve();
  },
};

const worker = new Worker(QUEUES.notifications, (job) => processNotification(job.data, channel), {
  connection: { url: env.REDIS_URL },
  concurrency: env.WORKER_CONCURRENCY,
});

worker.on('failed', (job, err) => {
  logger.warn({ jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'job failed');
});
worker.on('ready', () => {
  logger.info({ queue: QUEUES.notifications }, 'worker ready');
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
  await Promise.all([worker.close(), ...paymentWorkers.map((w) => w.close())]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
