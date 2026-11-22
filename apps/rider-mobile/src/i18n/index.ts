import { en, type MessageKey } from './en';

export type { MessageKey } from './en';

// DEBT(i18n): English only — locale detection (expo-localization) and pcm/yo/ha/ig catalogues pending — add files with the same keys.
const catalogue: Record<MessageKey, string> = en;

/** Translates a key and fills `{name}` placeholders. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return catalogue[key].replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    return v === undefined ? whole : String(v);
  });
}
