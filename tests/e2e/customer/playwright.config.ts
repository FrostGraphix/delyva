import { defineConfig } from '@playwright/test';
import { WEB_URL } from './env.js';

/** Click-through of the customer web build against a real API + Postgres + Redis (see global-setup). */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 240_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: WEB_URL,
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
});
