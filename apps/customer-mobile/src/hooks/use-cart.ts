import type { Cart, CartList } from '@delyva/contracts';
import { type ApiError, orderingKeys } from '@delyva/sdk';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback } from 'react';
import { ordering } from '../api/client';
import { useSession } from '../auth/session-store';
import { useGuestCart } from '../state/guest-cart-store';

/** What "Add to cart" needs, independent of guest/signed-in mode. */
export interface AddToCartInput {
  readonly vendorId: string;
  readonly vendorName: string;
  readonly branchId: string;
  readonly itemId: string;
  readonly name: string;
  readonly optionIds: string[];
  readonly optionNames: string[];
  readonly quantity: number;
  readonly unitPreviewMinor: number;
}

/** Server carts; only fetched once signed in (the carts API requires a session). */
export function useServerCarts(): UseQueryResult<CartList, ApiError> {
  const authed = useSession((s) => s.status === 'authed');
  return useQuery({
    queryKey: orderingKeys.carts(),
    queryFn: () => ordering.listCarts(),
    enabled: authed,
  });
}

/** Total item count across guest and server carts (badges, "View cart"). */
export function useCartCount(): number {
  const guest = useGuestCart((s) => s.lines);
  const carts = useServerCarts().data;
  const server = (carts?.items ?? []).reduce(
    (n, c) => n + c.lines.reduce((m, l) => m + l.quantity, 0),
    0,
  );
  return guest.reduce((n, l) => n + l.quantity, 0) + server;
}

function replaceCart(list: CartList | undefined, cart: Cart): CartList {
  const items = list?.items ?? [];
  const exists = items.some((c) => c.id === cart.id);
  return { items: exists ? items.map((c) => (c.id === cart.id ? cart : c)) : [...items, cart] };
}

/** Adds to the guest cart, or to the server cart (with a fresh idempotency key) when signed in. */
export function useAddToCart(): {
  add: (input: AddToCartInput) => Promise<void>;
  pending: boolean;
} {
  const authed = useSession((s) => s.status === 'authed');
  const addGuest = useGuestCart((s) => s.add);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (i: AddToCartInput) =>
      ordering.addCartLine(
        { branchId: i.branchId, itemId: i.itemId, quantity: i.quantity, optionIds: i.optionIds },
        randomUUID(),
      ),
    onSuccess: (cart) => {
      qc.setQueryData<CartList>(orderingKeys.carts(), (old) => replaceCart(old, cart));
    },
  });
  const add = useCallback(
    async (input: AddToCartInput): Promise<void> => {
      if (!authed) {
        addGuest(input);
        return;
      }
      await m.mutateAsync(input);
    },
    [authed, addGuest, m],
  );
  return { add, pending: m.isPending };
}

/** Variables for a line edit (quantity 0 removes the line). */
export interface LineEdit {
  readonly cartId: string;
  readonly lineId: string;
  readonly quantity: number;
}

/** Optimistic quantity change / removal on a server cart; rolls back on failure. */
export function useEditServerLine(): UseMutationResult<Cart, ApiError, LineEdit, { prev?: CartList }> {
  const qc = useQueryClient();
  return useMutation<Cart, ApiError, LineEdit, { prev?: CartList }>({
    mutationFn: ({ cartId, lineId, quantity }) =>
      quantity <= 0
        ? ordering.removeCartLine(cartId, lineId, randomUUID())
        : ordering.updateCartLine(cartId, lineId, { quantity }, randomUUID()),
    onMutate: async ({ cartId, lineId, quantity }) => {
      await qc.cancelQueries({ queryKey: orderingKeys.carts() });
      const prev = qc.getQueryData<CartList>(orderingKeys.carts());
      qc.setQueryData<CartList>(orderingKeys.carts(), (old) => ({
        items: (old?.items ?? []).map((c) =>
          c.id !== cartId
            ? c
            : {
                ...c,
                lines: c.lines
                  .map((l) => (l.id === lineId ? { ...l, quantity } : l))
                  .filter((l) => l.quantity > 0),
              },
        ),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(orderingKeys.carts(), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: orderingKeys.carts() }),
  });
}

/** Pushes guest lines into the server cart after sign-in, then clears the guest cart. */
export async function syncGuestCart(): Promise<void> {
  const { lines, clear } = useGuestCart.getState();
  for (const l of lines) {
    await ordering.addCartLine(
      { branchId: l.branchId, itemId: l.itemId, quantity: l.quantity, optionIds: [...l.optionIds] },
      randomUUID(),
    );
  }
  clear();
}
