import { defineConfig } from 'vitest/config';
import { vitestPreset } from '@delyva/config/vitest';

// DEBT(sdk): hooks.ts excluded from coverage — needs a React test renderer — add @testing-library/react in Phase 1.
export default defineConfig(vitestPreset({ coverageInclude: ['src/client.ts', 'src/realtime.ts'] }));
