import type { AddCartLine, Cart, UpdateCartLine } from '@delyva/contracts';
import { addLine, type CartLineState } from '../domain/cart.js';
import { OrderingError } from '../domain/ordering-errors.js';
import { ngn } from './order-dto.js';
import type { CartState, CartStore, CatalogPort, Clock, PricedLine } from './ports.js';

/** Collaborators of the cart use cases. */
export interface CartDeps {
  readonly carts: CartStore;
  readonly catalog: CatalogPort;
  readonly clock: Clock;
}

const MAX_SAVE_ATTEMPTS = 3;

function lineDto(line: CartLineState, priced: PricedLine | undefined): Cart['lines'][number] {
  const unit = (priced?.options ?? []).reduce(
    (s, o) => s + o.priceDeltaMinor,
    priced?.unitPriceMinor ?? 0,
  );
  return {
    id: line.id,
    itemId: line.itemId,
    name: priced?.name ?? '',
    quantity: line.quantity,
    options: (priced?.options ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      priceDelta: ngn(o.priceDeltaMinor),
    })),
    unitPrice: ngn(unit),
    lineTotal: ngn(unit * line.quantity),
    problem: priced?.problem ?? 'Item no longer exists',
  };
}

/** Re-prices a stored cart from the catalog (client prices are never stored or trusted). */
export async function cartDto(cart: CartState, catalog: CatalogPort): Promise<Cart> {
  const priced = await catalog.priceSelections(cart.vendorId, cart.lines);
  const lines = cart.lines.map((l, i) => lineDto(l, priced[i]));
  const subtotal = lines.reduce((s, l) => s + l.lineTotal.amountMinor, 0);
  return {
    id: cart.id,
    vendorId: cart.vendorId,
    branchId: cart.branchId,
    version: cart.version,
    lines,
    itemsSubtotal: ngn(subtotal),
    checkoutReady: lines.length > 0 && lines.every((l) => l.problem === null),
    updatedAt: cart.updatedAt.toISOString(),
  };
}

/** Validates one selection against the live menu. @throws OrderingError validation_failed */
async function assertOrderable(
  catalog: CatalogPort,
  vendorId: string,
  sel: { itemId: string; quantity: number; optionIds: readonly string[] },
): Promise<void> {
  const [priced] = await catalog.priceSelections(vendorId, [sel]);
  if (priced?.problem) throw new OrderingError('validation_failed', priced.problem);
}

/** Applies `change` to the user's cart with optimistic concurrency (retries on a race). */
async function mutateCart(
  deps: CartDeps,
  load: () => Promise<CartState | null>,
  change: (cart: CartState | null) => Promise<CartState>,
): Promise<Cart> {
  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    const current = await load();
    const next = await change(current);
    const saved = await deps.carts.save(
      { ...next, version: (current?.version ?? 0) + 1, updatedAt: deps.clock.now() },
      current?.version ?? null,
    );
    if (saved) return cartDto((await load()) ?? next, deps.catalog);
  }
  throw new OrderingError('conflict', 'The cart changed concurrently; please retry.');
}

/** Query: the caller's carts. */
export class ListCarts {
  /** @param deps collaborators */
  constructor(private readonly deps: CartDeps) {}

  /** Executes the query. */
  async execute(userId: string): Promise<Cart[]> {
    const carts = await this.deps.carts.listForUser(userId);
    return Promise.all(carts.map((c) => cartDto(c, this.deps.catalog)));
  }
}

/** Query: one cart of the caller (foreign ids are 404). */
export class GetCart {
  /** @param deps collaborators */
  constructor(private readonly deps: CartDeps) {}

  /** Executes the query. @throws OrderingError not_found */
  async execute(userId: string, cartId: string): Promise<Cart> {
    const cart = await this.deps.carts.findForUser(userId, cartId);
    if (!cart) throw new OrderingError('not_found', 'Cart not found.');
    return cartDto(cart, this.deps.catalog);
  }
}

/** Command: add a selection to the caller's cart for a branch (creates the cart). */
export class AddCartLineUseCase {
  /** @param deps collaborators */
  constructor(private readonly deps: CartDeps) {}

  /** Executes the command. @throws OrderingError not_found | validation_failed | conflict */
  async execute(userId: string, input: AddCartLine): Promise<Cart> {
    const branch = await this.deps.catalog.branch(input.branchId);
    if (branch?.acceptingOrders !== true) {
      if (!branch) throw new OrderingError('not_found', 'Branch not found.');
      throw new OrderingError('conflict', 'This vendor is not taking orders right now.');
    }
    const optionIds = input.optionIds ?? [];
    await assertOrderable(this.deps.catalog, branch.vendorId, { ...input, optionIds });
    const { clock } = this.deps;
    return mutateCart(
      this.deps,
      () => this.deps.carts.findByBranch(userId, input.branchId),
      (cart) => {
        const base: CartState = cart ?? {
          id: clock.uuid(),
          userId,
          vendorId: branch.vendorId,
          branchId: branch.branchId,
          version: 0,
          lines: [],
          updatedAt: clock.now(),
        };
        const lines = addLine(base.lines, { id: clock.uuid(), ...input, optionIds });
        return Promise.resolve({ ...base, lines });
      },
    );
  }
}

/** Command: change a line's quantity/options. */
export class UpdateCartLineUseCase {
  /** @param deps collaborators */
  constructor(private readonly deps: CartDeps) {}

  /** Executes the command. @throws OrderingError not_found | validation_failed | conflict */
  execute(userId: string, cartId: string, lineId: string, change: UpdateCartLine): Promise<Cart> {
    return mutateCart(
      this.deps,
      () => this.deps.carts.findForUser(userId, cartId),
      async (cart) => {
        const line = cart?.lines.find((l) => l.id === lineId);
        if (!cart || !line) throw new OrderingError('not_found', 'Cart line not found.');
        const next = {
          ...line,
          quantity: change.quantity ?? line.quantity,
          optionIds: change.optionIds ?? line.optionIds,
        };
        await assertOrderable(this.deps.catalog, cart.vendorId, next);
        return { ...cart, lines: cart.lines.map((l) => (l.id === lineId ? next : l)) };
      },
    );
  }
}

/** Command: remove a line. */
export class RemoveCartLineUseCase {
  /** @param deps collaborators */
  constructor(private readonly deps: CartDeps) {}

  /** Executes the command. @throws OrderingError not_found */
  execute(userId: string, cartId: string, lineId: string): Promise<Cart> {
    return mutateCart(
      this.deps,
      () => this.deps.carts.findForUser(userId, cartId),
      (cart) => {
        if (!cart?.lines.some((l) => l.id === lineId)) {
          throw new OrderingError('not_found', 'Cart line not found.');
        }
        return Promise.resolve({ ...cart, lines: cart.lines.filter((l) => l.id !== lineId) });
      },
    );
  }
}

/** Command: delete a cart. */
export class DeleteCartUseCase {
  /** @param carts cart store */
  constructor(private readonly carts: CartStore) {}

  /** Executes the command. @throws OrderingError not_found */
  async execute(userId: string, cartId: string): Promise<void> {
    if (!(await this.carts.delete(userId, cartId))) {
      throw new OrderingError('not_found', 'Cart not found.');
    }
  }
}
