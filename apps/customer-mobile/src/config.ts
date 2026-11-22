import { Platform } from 'react-native';

/**
 * Runtime configuration from `EXPO_PUBLIC_*` env vars (inlined by Expo at build time).
 * Nothing secret lives here: these values ship inside the app bundle.
 */
export interface AppConfig {
  /** API origin, e.g. `https://api.staging.delyva.ng`. Empty on web = same origin (proxy). */
  readonly apiUrl: string;
  /** Pricing zone code for quotes (Phase 1: one city). */
  readonly pricingZoneCode: string;
}

function resolveApiUrl(raw: string | undefined): string {
  const trimmed = (raw ?? '').replace(/\/+$/, '');
  if (trimmed.length > 0) return trimmed;
  const loc = (globalThis as { location?: { origin: string } }).location;
  if (Platform.OS === 'web' && loc) return loc.origin;
  return '';
}

/** Resolved app configuration. */
export const config: AppConfig = {
  apiUrl: resolveApiUrl(process.env.EXPO_PUBLIC_API_URL),
  // DEBT(pricing): zone code is configured, not derived — VendorSummary lacks the zone's city — expose pricing zone code in discovery.
  pricingZoneCode: process.env.EXPO_PUBLIC_PRICING_ZONE_CODE ?? 'lagos',
};

/** Wallet top-up presets in kobo (UI shortcuts only; the server validates every amount). */
export const TOP_UP_PRESETS_MINOR: readonly number[] = [100_000, 200_000, 500_000, 1_000_000];
/** Poll interval while the realtime socket is down (ARCHITECTURE: 10 s fallback). */
export const ORDER_POLL_FALLBACK_MS = 10_000;
/** Slow safety refresh while the socket is connected. */
export const ORDER_POLL_CONNECTED_MS = 60_000;
/** Poll interval while waiting for a provider payment to settle. */
export const PAYMENT_POLL_MS = 3_000;
/** Max recent searches kept on device. */
export const MAX_RECENT_SEARCHES = 8;
