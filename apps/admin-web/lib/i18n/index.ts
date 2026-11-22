import { en } from './en';

/** A message key of the console catalogue. */
export type MessageKey = keyof typeof en;

/**
 * Translates `key`, filling `{name}` placeholders from `vars`.
 * DEBT(i18n): English only — Pidgin/Yoruba/Hausa/Igbo catalogues and locale switching land
 * with the customer app's i18n setup — add a locale cookie + catalogue loader.
 */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}
