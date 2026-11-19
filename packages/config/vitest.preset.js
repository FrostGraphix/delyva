/**
 * Shared Vitest preset. Packages spread this into their own `defineConfig`.
 * @param {{ coverageInclude?: string[]; thresholds?: Record<string, number> }} [opts]
 */
export function vitestPreset(opts = {}) {
  return {
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      environment: 'node',
      passWithNoTests: false,
      coverage: {
        provider: 'v8',
        include: opts.coverageInclude ?? ['src/**/*.ts'],
        exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/index.ts'],
        thresholds: opts.thresholds ?? { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  };
}
