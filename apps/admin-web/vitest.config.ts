import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['{lib,components,app}/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      // Unit coverage targets the logic modules; pages, shell and client hooks are exercised by
      // the Playwright suite in tests/e2e/admin (see docs/ARCHITECTURE.md, admin web).
      include: [
        'lib/format.ts',
        'lib/roles.ts',
        'lib/i18n/index.ts',
        'lib/server/{bff,cookies,csrf,jwt,session-info}.ts',
        'components/{query-view,reason-dialog,riders-map,order-status-badge}.tsx',
        'app/**/*-form.ts',
        'app/**/kpis.ts',
        'app/**/find-order.ts',
      ],
      exclude: ['**/*.test.*'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
