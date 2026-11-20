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
  })
  .superRefine((env, ctx) => {
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
