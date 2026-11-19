import { defineConfig } from 'vitest/config';
import { vitestPreset } from '@delyva/config/vitest';

// Native components need a RN renderer; web components + generated data are covered.
export default defineConfig(
  vitestPreset({ coverageInclude: ['src/web-icon.tsx', 'src/generated/icon-paths.ts'] }),
);
