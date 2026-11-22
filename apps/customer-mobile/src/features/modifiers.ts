import type { MenuItem, ModifierGroup } from '@delyva/contracts';

/** Selected option ids per modifier group id. */
export type Selections = Readonly<Record<string, readonly string[]>>;

/** Why a group is invalid. */
export type GroupProblem = { kind: 'min'; count: number } | { kind: 'max'; count: number };

/** Validation result for an item's modifier selections. */
export interface SelectionCheck {
  readonly valid: boolean;
  readonly problems: Readonly<Record<string, GroupProblem>>;
}

/** Initial selections: empty for every group (the customer must choose required ones). */
export function emptySelections(item: MenuItem): Selections {
  return Object.fromEntries(item.modifierGroups.map((g) => [g.id, []]));
}

/**
 * Toggles an option. Single-choice groups (max 1) behave like radios; multi-choice groups
 * ignore taps that would exceed `maxSelect`. Unavailable options are never selected.
 */
export function toggleOption(
  group: ModifierGroup,
  current: Selections,
  optionId: string,
): Selections {
  const option = group.options.find((o) => o.id === optionId);
  if (!option?.available) return current;
  const picked = current[group.id] ?? [];
  let next: readonly string[];
  if (picked.includes(optionId)) next = picked.filter((id) => id !== optionId);
  else if (group.maxSelect === 1) next = [optionId];
  else if (picked.length >= group.maxSelect) next = picked;
  else next = [...picked, optionId];
  return { ...current, [group.id]: next };
}

/** Checks min/max for every group. */
export function checkSelections(item: MenuItem, s: Selections): SelectionCheck {
  const problems: Record<string, GroupProblem> = {};
  for (const g of item.modifierGroups) {
    const n = (s[g.id] ?? []).length;
    if (n < g.minSelect) problems[g.id] = { kind: 'min', count: g.minSelect };
    else if (n > g.maxSelect) problems[g.id] = { kind: 'max', count: g.maxSelect };
  }
  return { valid: Object.keys(problems).length === 0, problems };
}

/** Flattens selections into the `optionIds` the cart API takes (group order preserved). */
export function selectedOptionIds(item: MenuItem, s: Selections): string[] {
  return item.modifierGroups.flatMap((g) => [...(s[g.id] ?? [])]);
}

/**
 * Display-only price preview in kobo (catalog price + chosen deltas) × quantity, for the
 * "Add to cart" button. The server re-prices every cart; this number is never sent.
 */
export function previewMinor(item: MenuItem, s: Selections, quantity: number): number {
  const deltas = item.modifierGroups.reduce((sum, g) => {
    const ids = new Set(s[g.id] ?? []);
    return sum + g.options.filter((o) => ids.has(o.id)).reduce((a, o) => a + o.priceDelta.amountMinor, 0);
  }, 0);
  return (item.price.amountMinor + deltas) * quantity;
}
