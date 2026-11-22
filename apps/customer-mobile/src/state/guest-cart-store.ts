import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAX_LINE_QUANTITY } from '@delyva/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** A line a guest added before signing in (synced to the server cart at sign-in). */
export interface GuestLine {
  readonly key: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly branchId: string;
  readonly itemId: string;
  readonly name: string;
  readonly optionIds: readonly string[];
  readonly optionNames: readonly string[];
  readonly quantity: number;
  /** Catalog unit price incl. options, display only; the server re-prices at sign-in. */
  readonly unitPreviewMinor: number;
}

/** Guest cart state. */
export interface GuestCartState {
  readonly lines: readonly GuestLine[];
  readonly add: (line: Omit<GuestLine, 'key'>) => void;
  readonly setQuantity: (key: string, quantity: number) => void;
  readonly remove: (key: string) => void;
  readonly clear: () => void;
}

/** Same item + same options = same line. */
export function guestLineKey(l: Pick<GuestLine, 'branchId' | 'itemId' | 'optionIds'>): string {
  return `${l.branchId}:${l.itemId}:${[...l.optionIds].sort().join(',')}`;
}

/** Local cart for guests (carts API requires sign-in; CLAUDE.md asks for the phone only at checkout). */
export const useGuestCart = create<GuestCartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line) => {
        const key = guestLineKey(line);
        set((s) => {
          const existing = s.lines.find((l) => l.key === key);
          if (!existing) return { lines: [...s.lines, { ...line, key }] };
          const quantity = Math.min(MAX_LINE_QUANTITY, existing.quantity + line.quantity);
          return { lines: s.lines.map((l) => (l.key === key ? { ...l, quantity } : l)) };
        });
      },
      setQuantity: (key, quantity) => {
        set((s) => ({
          lines: s.lines.map((l) =>
            l.key === key ? { ...l, quantity: Math.min(MAX_LINE_QUANTITY, Math.max(1, quantity)) } : l,
          ),
        }));
      },
      remove: (key) => {
        set((s) => ({ lines: s.lines.filter((l) => l.key !== key) }));
      },
      clear: () => {
        set({ lines: [] });
      },
    }),
    { name: 'delyva.guestCart', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
