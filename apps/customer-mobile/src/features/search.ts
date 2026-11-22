import type { VendorSummary } from '@delyva/contracts';

/** Lower-cases and strips accents so "Café" matches "cafe". */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Client-side filter of discovery results by vendor name or category (every query word must
 * match). DEBT(search): client-side only — no search endpoint yet — move to Meilisearch with typo tolerance and dishes.
 */
export function filterVendors(
  vendors: readonly VendorSummary[],
  query: string,
  categoryLabel: (c: VendorSummary['category']) => string,
): VendorSummary[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return vendors.filter((v) => {
    const hay = `${fold(v.name)} ${fold(v.category)} ${fold(categoryLabel(v.category))}`;
    return words.every((w) => hay.includes(w));
  });
}

/** Adds a query to the front of the recent list (deduped, case-insensitive, capped). */
export function pushRecent(recent: readonly string[], query: string, max: number): string[] {
  const q = query.trim();
  if (q.length < 2) return [...recent];
  return [q, ...recent.filter((r) => fold(r) !== fold(q))].slice(0, max);
}
