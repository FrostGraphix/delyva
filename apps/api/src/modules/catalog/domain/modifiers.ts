import { Money } from '@delyva/utils';
import { CatalogError } from './catalog-errors.js';

/** Modifier option as seen by the selection policy. */
export interface ModifierOptionRule {
  readonly id: string;
  readonly priceDeltaMinor: number;
  readonly available: boolean;
}

/** Modifier group with selection bounds. */
export interface ModifierGroupRule {
  readonly id: string;
  readonly name: string;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly options: readonly ModifierOptionRule[];
}

/** Validates a group definition. @throws CatalogError validation_failed */
export function assertValidModifierGroup(g: {
  minSelect: number;
  maxSelect: number;
  optionCount: number;
}): void {
  const ints = [g.minSelect, g.maxSelect, g.optionCount].every(Number.isInteger);
  if (!ints || g.minSelect < 0 || g.maxSelect < 1) {
    throw new CatalogError('validation_failed', 'Selection bounds must be non-negative integers');
  }
  if (g.minSelect > g.maxSelect) {
    throw new CatalogError('validation_failed', 'minSelect must be <= maxSelect');
  }
  if (g.maxSelect > g.optionCount) {
    throw new CatalogError('validation_failed', 'maxSelect must be <= number of options');
  }
}

/** Result of validating a customer's modifier choices. */
export type SelectionResult =
  | { readonly ok: true; readonly priceDelta: Money }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Validates selected option ids against an item's groups (unknown, duplicate, unavailable,
 * and per-group min/max) and sums the price deltas in kobo. Used by ordering when re-pricing carts.
 */
export function validateSelection(
  groups: readonly ModifierGroupRule[],
  selectedOptionIds: readonly string[],
): SelectionResult {
  const errors: string[] = [];
  if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
    errors.push('An option was selected more than once');
  }
  const known = new Map(groups.flatMap((g) => g.options.map((o) => [o.id, o] as const)));
  for (const id of selectedOptionIds) {
    const option = known.get(id);
    if (!option) errors.push(`Unknown option ${id}`);
    else if (!option.available) errors.push(`Option ${id} is unavailable`);
  }
  for (const g of groups) {
    const n = g.options.filter((o) => selectedOptionIds.includes(o.id)).length;
    if (n < g.minSelect) errors.push(`${g.name}: choose at least ${g.minSelect}`);
    if (n > g.maxSelect) errors.push(`${g.name}: choose at most ${g.maxSelect}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const priceDelta = selectedOptionIds.reduce(
    (sum, id) => sum.add(Money.ofMinor(known.get(id)?.priceDeltaMinor ?? 0, 'NGN')),
    Money.zero('NGN'),
  );
  return { ok: true, priceDelta };
}
