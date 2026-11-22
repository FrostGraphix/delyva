import { z } from 'zod';

const ClaimsSchema = z.object({
  sub: z.string(),
  roles: z.array(z.string()),
  exp: z.number().int(),
});

/** Access-token claims the console needs for routing. */
export type AccessClaims = z.infer<typeof ClaimsSchema>;

/**
 * Decodes (does NOT verify) an access JWT's payload. Used only to route the UI and refuse
 * non-console roles early; the API verifies the signature and enforces roles on every call.
 */
export function decodeClaims(token: string): AccessClaims | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const json: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const parsed = ClaimsSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
