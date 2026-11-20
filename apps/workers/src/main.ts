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

async function shutdown(): Promise<void> {
  await running.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
