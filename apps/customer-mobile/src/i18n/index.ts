import { en, type MessageKey } from './en';

export type { MessageKey } from './en';

/** Interpolation values for `{placeholder}` tokens. */
export type MessageParams = Readonly<Record<string, string | number>>;

/**
 * Translates a key into the active locale (English only in Phase 1) and fills `{name}` tokens.
 * Unknown placeholders are left visible so missing params are caught in review.
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const template: string = en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = params[name];
    return v === undefined ? match : String(v);
  });
}
