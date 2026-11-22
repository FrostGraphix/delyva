import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { MAX_RECENT_SEARCHES } from '../config';
import { pushRecent } from '../features/search';

/** The delivery point currently used for discovery and checkout. */
export interface DeliveryAddress {
  readonly label: string;
  readonly line1: string;
  readonly landmark: string | null;
  readonly lat: number;
  readonly lng: number;
  /** Server address id once saved (signed-in users only). */
  readonly savedId: string | null;
}

/** Non-sensitive device preferences. */
export interface PrefsState {
  readonly hydrated: boolean;
  readonly onboarded: boolean;
  readonly address: DeliveryAddress | null;
  readonly firstName: string | null;
  readonly recentSearches: readonly string[];
  readonly notificationsAsked: boolean;
  readonly completeOnboarding: () => void;
  readonly setAddress: (a: DeliveryAddress) => void;
  readonly setFirstName: (n: string) => void;
  readonly addRecentSearch: (q: string) => void;
  readonly clearRecentSearches: () => void;
  readonly markNotificationsAsked: () => void;
  readonly resetAccountData: () => void;
}

/**
 * Persisted UI preferences. Never put tokens or PII beyond a first name here.
 * DEBT(storage): AsyncStorage instead of MMKV — react-native-mmkv 4 needs nitro-modules + a dev client — switch once the EAS dev client lands.
 */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      hydrated: false,
      onboarded: false,
      address: null,
      firstName: null,
      recentSearches: [],
      notificationsAsked: false,
      completeOnboarding: () => {
        set({ onboarded: true });
      },
      setAddress: (address) => {
        set({ address });
      },
      setFirstName: (firstName) => {
        set({ firstName });
      },
      addRecentSearch: (q) => {
        set((s) => ({ recentSearches: pushRecent(s.recentSearches, q, MAX_RECENT_SEARCHES) }));
      },
      clearRecentSearches: () => {
        set({ recentSearches: [] });
      },
      markNotificationsAsked: () => {
        set({ notificationsAsked: true });
      },
      resetAccountData: () => {
        set((s) => ({
          firstName: null,
          address: s.address ? { ...s.address, savedId: null } : null,
        }));
      },
    }),
    {
      name: 'delyva.prefs',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated: _h, ...rest }) => rest,
      onRehydrateStorage: () => () => {
        usePrefs.setState({ hydrated: true });
      },
    },
  ),
);
