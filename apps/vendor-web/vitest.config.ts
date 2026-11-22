import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      include: [
        'lib/money.ts',
        'lib/phone.ts',
        'lib/hours.ts',
        'lib/i18n/index.ts',
        'lib/server/csrf.ts',
        'lib/server/refresh.ts',
        'components/board/**/*.tsx',
        'components/board/**/*.ts',
      ],
      exclude: ['**/*.test.*'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
