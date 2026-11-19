import { Worker } from 'bullmq';
import { pino } from 'pino';
import { z } from 'zod';
import { type NotificationChannel, processNotification, QUEUES } from './jobs/notification.job.js';

const env = z
  .object({
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    LOG_LEVEL: z.string().default('info'),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
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

async function shutdown(): Promise<void> {
  await worker.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
