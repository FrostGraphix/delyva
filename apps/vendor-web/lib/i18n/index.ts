import { en, type MessageKey } from './en';

export type { MessageKey } from './en';

/** Interpolation variables. */
export type MessageVars = Readonly<Record<string, string | number>>;

/**
 * Translates a key with `{name}` interpolation. English is the only catalogue today.
 * DEBT(i18n): single locale — Pidgin/Yoruba/Hausa/Igbo catalogues pending translation — add per-locale files and a locale switch.
 */
export function t(key: MessageKey, vars: MessageVars = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m,
  );
}

/** Loose lookup for computed keys (e.g. `status.${s}`), falling back to `fallback`. */
export function tMaybe(key: string, fallback: MessageKey): string {
  return key in en ? t(key as MessageKey) : t(fallback);
}
