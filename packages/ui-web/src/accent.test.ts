import { describe, expect, it } from 'vitest';
import {
  ACCENT_COOKIE,
  accentCookieString,
  accentFromCookieString,
  applyAccent,
  parseAccent,
} from './accent.js';

describe('accent cookie', () => {
  it('parses a valid accent and falls back to green for unknown or missing values', () => {
    expect(parseAccent('orange')).toBe('orange');
    expect(parseAccent('green')).toBe('green');
    expect(parseAccent('purple')).toBe('green');
    expect(parseAccent(undefined)).toBe('green');
    expect(parseAccent(42)).toBe('green');
  });

  it('reads the accent out of a multi-cookie header', () => {
    expect(accentFromCookieString(`a=1; ${ACCENT_COOKIE}=orange; b=2`)).toBe('orange');
    expect(accentFromCookieString(`${ACCENT_COOKIE}=<script>`)).toBe('green');
    expect(accentFromCookieString('junk; other=orange')).toBe('green');
    expect(accentFromCookieString(null)).toBe('green');
    expect(accentFromCookieString('')).toBe('green');
  });

  it('serialises a one-year SameSite=Lax site-wide cookie that is not httpOnly', () => {
    const c = accentCookieString('orange');
    expect(c).toContain('dl_accent=orange');
    expect(c).toContain('Max-Age=31536000');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
    expect(c).not.toContain('HttpOnly');
  });

  it('applyAccent sets data-accent and the cookie', () => {
    const attrs: Record<string, string> = {};
    const doc = {
      cookie: '',
      documentElement: {
        setAttribute: (n: string, v: string): void => {
          attrs[n] = v;
        },
      },
    };
    applyAccent('orange', doc);
    expect(attrs['data-accent']).toBe('orange');
    expect(accentFromCookieString(doc.cookie)).toBe('orange');
  });
});
