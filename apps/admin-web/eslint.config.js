import { delyvaConfig } from '@delyva/config/eslint';

export default [
  ...delyvaConfig({ tsconfigRootDir: import.meta.dirname, browser: true }),
  { ignores: ['next.config.ts', '.next/**'] },
];
