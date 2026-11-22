import { DEFAULT_ACCENT, isAccentName, type AccentName } from '@delyva/design-tokens';

/** Name of the non-sensitive UI-preference cookie that stores the chosen accent. */
export const ACCENT_COOKIE = 'dl_accent';

/** Cookie lifetime: one year, in seconds. */
export const ACCENT_COOKIE_MAX_AGE_S = 31_536_000;

/** Validates untrusted input (cookie value, query) and falls back to the default accent. */
export function parseAccent(value: unknown): AccentName {
  return isAccentName(value) ? value : DEFAULT_ACCENT;
}

/** Extracts the accent from a `Cookie` request header or `document.cookie` string. */
export function accentFromCookieString(cookies: string | null | undefined): AccentName {
  if (!cookies) return DEFAULT_ACCENT;
  for (const part of cookies.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === ACCENT_COOKIE) return parseAccent(part.slice(eq + 1).trim());
  }
  return DEFAULT_ACCENT;
}

/** Serialises the `Set-Cookie`-style string for an accent (SameSite=Lax, 1 year, site-wide). */
export function accentCookieString(accent: AccentName): string {
  return `${ACCENT_COOKIE}=${accent}; Path=/; Max-Age=${String(ACCENT_COOKIE_MAX_AGE_S)}; SameSite=Lax`;
}

/** The slice of `Document` that {@link applyAccent} needs (eases testing). */
export interface AccentTarget {
  readonly documentElement: { setAttribute(name: string, value: string): void };
  cookie: string;
}

/** Applies an accent to `<html data-accent>` immediately and persists it in the cookie. */
export function applyAccent(accent: AccentName, doc: AccentTarget = document): void {
  doc.documentElement.setAttribute('data-accent', accent);
  doc.cookie = accentCookieString(accent);
}
