import { z } from 'zod';

const EnvSchema = z.object({
  /** Origin of the Delyva API, reached only from the server (never exposed to the browser). */
  ADMIN_API_BASE_URL: z.url(),
  /** Upstream timeout; short because the console runs on office networks but the API is remote. */
  ADMIN_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(15_000),
});

/** Server-only configuration of the admin BFF. */
export type AdminEnv = z.infer<typeof EnvSchema>;

let cached: AdminEnv | null = null;

/** Reads and validates the BFF env once. @throws ZodError when misconfigured */
export function adminEnv(): AdminEnv {
  cached ??= EnvSchema.parse(process.env);
  return cached;
}
