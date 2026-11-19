import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Shared flat config: strict type-aware TS rules, no console, and import boundaries.
 * Boundaries: nobody imports from apps/*; packages never import apps; deep imports
 * into other packages' src are forbidden (use the package entry point).
 * @param {{ tsconfigRootDir: string; browser?: boolean }} opts
 */
export function delyvaConfig({ tsconfigRootDir, browser = false }) {
  return tseslint.config(
    {
      ignores: [
        'dist/**',
        '.next/**',
        '.expo/**',
        'coverage/**',
        '**/*.js',
        '**/*.mjs',
        '**/*.cjs',
        'next-env.d.ts',
        'expo-env.d.ts',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        globals: browser ? { ...globals.browser, ...globals.node } : { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        'no-console': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-non-null-assertion': 'error',
        '@typescript-eslint/ban-ts-comment': 'error',
        '@typescript-eslint/consistent-type-imports': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            destructuredArrayIgnorePattern: '^_',
          },
        ],
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/apps/*', '@delyva/api', '@delyva/api/*'],
                message: 'Apps must never be imported; use @delyva/sdk or @delyva/contracts.',
              },
              {
                group: ['@delyva/*/src/*', '@delyva/*/src'],
                message: 'Import packages through their public entry point.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
  );
}

/**
 * Hexagonal layering rules for a NestJS module tree (domain imports nothing framework-y).
 */
export const layerRules = [
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@nestjs/*',
                'drizzle-orm',
                'drizzle-orm/*',
                'ioredis',
                'pg',
                '../application/*',
                '../api/*',
                '../infrastructure/*',
                '**/application/**',
                '**/infrastructure/**',
                '**/api/**',
              ],
              message: 'domain must not import frameworks or outer layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../api/*',
                '../infrastructure/*',
                '**/infrastructure/**',
                'drizzle-orm',
                'ioredis',
                'pg',
              ],
              message: 'application depends only on domain and ports.',
            },
          ],
        },
      ],
    },
  },
];
