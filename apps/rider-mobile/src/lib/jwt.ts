import type { Role } from '@delyva/contracts';
import { RoleSchema } from '@delyva/contracts';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decodes base64url without relying on `atob` (absent on some RN engines). */
function base64UrlDecode(input: string): string {
  const s = input.replace(/-/g, '+').replace(/_/g, '/');
  let bits = 0;
  let value = 0;
  let out = '';
  for (const ch of s) {
    const idx = B64.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >> bits) & 0xff);
    }
  }
  return out; // claims we read (uuid, roles) are ASCII
}

/**
 * Reads the `roles` claim from an access token for UI routing only. The server verifies every
 * token; the app never trusts this for authorization.
 */
export function rolesFromAccessToken(token: string): Role[] {
  const payload = token.split('.')[1];
  if (!payload) return [];
  try {
    const claims = JSON.parse(base64UrlDecode(payload)) as { roles?: unknown };
    const parsed = RoleSchema.array().safeParse(claims.roles);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
