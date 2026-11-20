import { MAX_CART_LINES, MAX_LINE_QUANTITY } from '@delyva/contracts';
import { OrderingError } from './ordering-errors.js';

/** A stored cart line (no prices: they are always re-read from the catalog). */
export interface CartLineState {
  readonly id: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly optionIds: readonly string[];
}

/** Canonical key of a selection: same item + same options (order-insensitive) merge. */
export function selectionKey(itemId: string, optionIds: readonly string[]): string {
  return `${itemId}|${[...optionIds].sort().join(',')}`;
}

/**
 * Adds a selection: merges into an equal line (quantity capped) or appends a new line.
 * @throws OrderingError validation_failed when the cart would exceed its limits
 */
export function addLine(
  lines: readonly CartLineState[],
  add: { id: string; itemId: string; quantity: number; optionIds: readonly string[] },
): CartLineState[] {
  const key = selectionKey(add.itemId, add.optionIds);
  const existing = lines.find((l) => selectionKey(l.itemId, l.optionIds) === key);
  if (existing) {
    const quantity = existing.quantity + add.quantity;
    if (quantity > MAX_LINE_QUANTITY) {
      throw new OrderingError('validation_failed', `At most ${MAX_LINE_QUANTITY} per line.`);
    }
    return lines.map((l) => (l.id === existing.id ? { ...l, quantity } : l));
  }
  if (lines.length >= MAX_CART_LINES) {
    throw new OrderingError('validation_failed', `At most ${MAX_CART_LINES} lines per cart.`);
  }
  return [
    ...lines,
    { id: add.id, itemId: add.itemId, quantity: add.quantity, optionIds: [...add.optionIds] },
  ];
}
