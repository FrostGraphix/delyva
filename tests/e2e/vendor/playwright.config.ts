import { defineConfig } from '@playwright/test';
import { API_URL, WEB_PORT, WEB_URL } from './env';

/**
 * Vendor portal E2E against a REAL API (own DB delyva_vendorweb_e2e, Redis db 5, port 3322) and the
 * real Next app on 3331. Start prerequisites: docker-compose `delyva` (Postgres 55432, Redis 56379),
 * `pnpm --filter @delyva/api build`.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: { channel: process.env.E2E_BROWSER_CHANNEL ?? 'chrome', baseURL: WEB_URL, trace: 'retain-on-failure', viewport: { width: 1280, height: 800 } },
  webServer: [
    {
      command: 'node tests/e2e/vendor/start-api.mjs',
      cwd: '../../..',
      url: `${API_URL}/healthz`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `pnpm exec next dev --port ${String(WEB_PORT)}`,
      cwd: '../../../apps/vendor-web',
      url: `${WEB_URL}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DELYVA_API_URL: API_URL,
        NEXT_PUBLIC_REALTIME_URL: API_URL,
        NEXT_PUBLIC_AUTO_REJECT_SECONDS: '300',
      },
    },
  ],
});
