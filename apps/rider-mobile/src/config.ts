/**
 * Runtime configuration. `EXPO_PUBLIC_*` values are inlined by Expo at build time; nothing is
 * hard-coded here. An empty value makes the app show a configuration error instead of guessing.
 */
export const API_URL: string = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

/** Location cadence while on a trip (CLAUDE.md: every 4–5 s). */
export const TRIP_LOCATION_INTERVAL_MS = 4_500;
/** Location cadence while online and idle (CLAUDE.md: every 30 s). */
export const IDLE_LOCATION_INTERVAL_MS = 30_000;
/** Minimum battery the API accepts for going online (mirrors DISPATCH_MIN_BATTERY_PCT default). */
export const MIN_BATTERY_PCT = 15;
