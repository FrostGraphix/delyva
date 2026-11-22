import { defineConfig, devices } from '@playwright/test';
import { E2E } from './e2e-env.mjs';

/** Rider app click-through against the real API (see stack.mjs). Run: pnpm e2e:rider */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 6 * 60_000,
  workers: 1,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    ...devices['Pixel 7'],
    baseURL: E2E.webOrigin,
    permissions: ['geolocation'],
    geolocation: { latitude: 6.4301, longitude: 3.4101, accuracy: 10 },
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'node stack.mjs',
    cwd: import.meta.dirname,
    url: `${E2E.webOrigin}/healthz`,
    timeout: 8 * 60_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
