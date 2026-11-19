import { delyvaConfig, layerRules } from '@delyva/config/eslint';

export default [
  { ignores: ['drizzle.config.ts', 'drizzle/**'] },
  ...delyvaConfig({ tsconfigRootDir: import.meta.dirname }),
  ...layerRules,
  {
    // Nest DI relies on runtime class references in constructor params.
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-unsafe-class-instance-assignment': 'off',
    },
  },
];
