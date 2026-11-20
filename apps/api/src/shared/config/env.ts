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
