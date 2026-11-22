# ADR 0800 — Customer app: state, navigation and web target

- Status: accepted
- Date: 2026-11-21

## Context

The customer app must run on low-end Android, tolerate bad networks, let guests browse, and also build for web so the flows can be clicked through and tested end to end.

## Decision

1. **State split.** Server state = TanStack Query (offline-first network mode, 24 h cache, 4xx not retried, jittered backoff). UI/session state = Zustand: `session` (tokens), `prefs` (onboarding flag, delivery address, first name, recents), `guest-cart`. No server data is copied into Zustand.
2. **Tokens.** Refresh token and device id live in `expo-secure-store`; the 15-minute access token is memory-only. A `fetch` wrapper refreshes once on 401 (single in-flight refresh) and replays the same request with its original `Idempotency-Key`; a failed refresh signs out locally. The web build keeps tokens in memory only (DEBT: httpOnly cookies).
3. **Guest first.** The carts API needs a session, so guests use a local cart that is replayed into the server cart right after OTP verification (new idempotency key per line). The phone number is requested only at checkout (and for inbox/orders/wallet).
4. **Expo Router layout.** Root stack: splash, welcome, location, address, `(tabs)`, vendor, checkout, payment, placed, track, order, wallet, inbox, addresses, login (modal), name. Tab destinations are reached with `navigate`, never `push`.
5. **Platform files.** Maps use `.native.tsx` (react-native-maps) with a static web fallback; secure storage uses `.native.ts` (expo-secure-store) with an in-memory web fallback.
6. **Storage.** AsyncStorage for non-sensitive prefs instead of MMKV: `react-native-mmkv` 4 needs `react-native-nitro-modules` and a custom dev client, which Expo Go and the web target do not provide. DEBT marker in `prefs-store.ts`.
7. **Realtime.** `RealtimeClient` from the SDK; the order query is polled every 10 s only while the socket is disconnected (60 s safety refresh otherwise).
8. **Design system.** Flat content (Card, Chip, ChoiceRow) and glass only for floating controls (tab bar, sheets). New components were added to `packages/ui-native` as new files; icons are new SVGs in `packages/icons`.

## Consequences

- Web E2E can exercise the whole customer journey; native-only behaviours (maps, secure store, push, haptics) are not covered by it.
- Dependencies added to the app (all MIT/Apache-2.0, versions resolved by `expo install` for SDK 58): expo-secure-store, expo-web-browser, expo-location, expo-notifications, expo-crypto, expo-device, expo-haptics, react-native-maps, react-native-web, @expo/metro-runtime, @react-native-async-storage/async-storage, @react-native-community/netinfo, zustand, @tanstack/react-query, jest-expo, jest, @testing-library/react-native, test-renderer; E2E: @playwright/test.
