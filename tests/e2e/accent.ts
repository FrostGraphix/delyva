import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface TokenFile {
  accent: Record<string, { light: { primary: string } }>;
}

/**
 * The light-theme `primary` token of an accent, as the `rgb(r, g, b)` string a browser computes.
 * `fromDir` is the calling spec's directory (it differs between the CJS and ESM suites).
 */
export function primaryRgb(accent: 'green' | 'orange', fromDir: string): string {
  const file = resolve(fromDir, '../../../packages/design-tokens/tokens/tokens.json');
  const tokens = JSON.parse(readFileSync(file, 'utf8')) as TokenFile;
  const hex = tokens.accent[accent]?.light.primary;
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`no primary token for ${accent}`);
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${String((n >> 16) & 255)}, ${String((n >> 8) & 255)}, ${String(n & 255)})`;
}
