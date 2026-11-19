import { z } from 'zod';

/** GET /healthz and /readyz response. */
export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.record(z.string(), z.enum(['up', 'down'])).optional(),
});
/** Health response. */
export type Health = z.infer<typeof HealthSchema>;
