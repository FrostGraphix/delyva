import { defineConfig } from '@playwright/test';

const root = `${__dirname}/../../../`;
const adminWeb = `${root}apps/admin-web`;

/** Ports and isolation are fixed by the task brief (see docs/ARCHITECTURE.md → admin web E2E). */
export const E2E = {
  apiPort: 3323,
  webPort: 3332,
  database: 'delyva_adminweb_e2e',
  redisDb: 6,
  bullPrefix: 'adminweb-e2e',
} as const;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: `http://localhost:${String(E2E.webPort)}`,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node tests/e2e/admin/start-api.mjs',
      cwd: root,
      url: `http://127.0.0.1:${String(E2E.apiPort)}/healthz`,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      command: `pnpm exec next build && pnpm exec next start --port ${String(E2E.webPort)}`,
      cwd: adminWeb,
      url: `http://localhost:${String(E2E.webPort)}/login`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: { ADMIN_API_BASE_URL: `http://127.0.0.1:${String(E2E.apiPort)}` },
    },
  ],
});
