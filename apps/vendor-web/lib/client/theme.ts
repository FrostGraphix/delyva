/** Theme preference. `system` follows `prefers-color-scheme` via the token CSS. */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'delyva.theme';

/** Reads the stored preference (per-browser convenience; defaults to system). */
export function storedTheme(): ThemePref {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Applies a preference to `<html data-theme>` and remembers it. */
export function setTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  try {
    window.localStorage.setItem(KEY, pref);
  } catch {
    // Storage blocked: the choice lasts for this page view.
  }
}

/** Effect: applies the stored preference on mount. */
export function applyStoredTheme(): void {
  setTheme(storedTheme());
}
