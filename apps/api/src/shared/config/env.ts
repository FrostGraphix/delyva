import { z } from 'zod';

/** Validated runtime configuration schema. The process refuses to boot on invalid env. */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3300),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    HASH_PEPPER: z.string().min(32),
    JWT_PRIVATE_KEY_PEM_B64: z.string().optional().default(''),
    JWT_KEY_ID: z.string().min(1).default('dev-1'),
    JWT_ISSUER: z.string().min(1),
    JWT_AUDIENCE: z.string().min(1),
    SMS_PROVIDER: z.enum(['termii', 'dev']).default('dev'),
    TERMII_API_KEY: z.string().optional().default(''),
    TERMII_SENDER_ID: z.string().default('Delyva'),
    TERMII_BASE_URL: z.url().default('https://api.ng.termii.com'),
    ETA_PROVIDER: z.enum(['haversine', 'google']).default('haversine'),
    GOOGLE_MAPS_API_KEY: z.string().optional().default(''),
    BULLMQ_PREFIX: z.string().min(1).default('bull'),
    NOTIFICATIONS_CONSUMER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    // payments (ADR 0300)
    PAYMENTS_PROVIDER: z.enum(['paystack', 'fake']).default('fake'),
    PAYSTACK_SECRET_KEY: z.string().optional().default(''),
    PAYSTACK_BASE_URL: z.url().default('https://api.paystack.co'),
    PAYSTACK_WEBHOOK_IPS: z
      .string()
      .default('')
      .transform((s) =>
        s
          .split(',')
          .map((x) => x.trim())
          .filter((x) => x !== ''),
      ),
    PAYMENTS_FAKE_WEBHOOK_SECRET: z.string().optional().default(''),
    PAYMENTS_CUSTOMER_EMAIL_DOMAIN: z.string().min(3).default('customers.delyva.invalid'),
    PAYOUT_MIN_MINOR: z.coerce.number().int().min(1).default(100_000),
    INTERNAL_JOBS_TOKEN: z.string().optional().default(''),
    // ordering (ADR 0500)
    /** Seconds a PLACED order waits for the vendor before it is auto-rejected. */
    ORDERING_AUTO_REJECT_SECONDS: z.coerce.number().int().min(1).max(3_600).default(300),
    /** Platform commission on the items subtotal, basis points (introductory 0 %). */
    ORDERING_VENDOR_COMMISSION_BPS: z.coerce.number().int().min(0).max(10_000).default(0),
    /** Rider share of delivery + surge fees, basis points. */
    ORDERING_RIDER_DELIVERY_SHARE_BPS: z.coerce.number().int().min(0).max(10_000).default(8_000),
    /** Runs the in-process auto-reject worker and payment-event consumer. */
    ORDERING_JOBS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    // dispatch (ADR 0600)
    DISPATCH_OFFER_TIMEOUT_MS: z.coerce.number().int().min(100).default(20_000),
    DISPATCH_RADII_M: z
      .string()
      .default('3000,5000,8000')
      .transform((s) => s.split(',').map((x) => Number(x.trim())))
      .pipe(z.array(z.number().int().positive()).min(1)),
    DISPATCH_DECLINES_BEFORE_WIDEN: z.coerce.number().int().min(1).default(3),
    DISPATCH_MAX_OFFERS: z.coerce.number().int().min(1).default(12),
    DISPATCH_GPS_MAX_DISTANCE_M: z.coerce.number().int().min(10).default(300),
    DISPATCH_RIDER_SPEED_MPS: z.coerce.number().positive().default(6),
    DISPATCH_DEFAULT_TRAVEL_SECONDS: z.coerce.number().int().min(0).default(600),
    DISPATCH_MIN_BATTERY_PCT: z.coerce.number().int().min(0).max(100).default(15),
    DISPATCH_CONSUMER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    DISPATCH_WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.ETA_PROVIDER === 'google' && env.GOOGLE_MAPS_API_KEY === '') {
      ctx.addIssue({ code: 'custom', message: 'ETA_PROVIDER=google requires GOOGLE_MAPS_API_KEY' });
    }
    if (env.NODE_ENV !== 'production') return;
    if (env.SMS_PROVIDER !== 'termii' || env.TERMII_API_KEY === '') {
      ctx.addIssue({
        code: 'custom',
        message: 'production requires SMS_PROVIDER=termii and TERMII_API_KEY',
      });
    }
    if (env.JWT_PRIVATE_KEY_PEM_B64 === '') {
      ctx.addIssue({ code: 'custom', message: 'production requires JWT_PRIVATE_KEY_PEM_B64' });
    }
    if (env.PAYMENTS_PROVIDER !== 'paystack' || env.PAYSTACK_SECRET_KEY === '') {
      ctx.addIssue({
        code: 'custom',
        message: 'production requires PAYMENTS_PROVIDER=paystack and PAYSTACK_SECRET_KEY',
      });
    }
    if (env.PAYSTACK_WEBHOOK_IPS.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'production requires PAYSTACK_WEBHOOK_IPS' });
    }
    if (env.INTERNAL_JOBS_TOKEN.length < 32) {
      ctx.addIssue({
        code: 'custom',
        message: 'production requires INTERNAL_JOBS_TOKEN (>= 32 chars)',
      });
    }
  });

/** Validated environment. */
export type Env = z.infer<typeof EnvSchema>;

/** DI token for the validated {@link Env}. */
export const ENV = Symbol('ENV');

/** Parses process env; throws with a readable list of problems (never values). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`);
    throw new Error(`Invalid environment:\n${issues.join('\n')}`);
  }
  return parsed.data;
}
