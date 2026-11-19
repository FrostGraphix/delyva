import { defineConfig } from 'vitest/config';
import { vitestPreset } from '@delyva/config/vitest';

export default defineConfig(
  vitestPreset({ thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 } }),
);
