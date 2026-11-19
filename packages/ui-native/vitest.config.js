import { defineConfig } from 'vitest/config';
import { vitestPreset } from '@delyva/config/vitest';

// DEBT(ui-native): button.tsx untested — needs React Native Testing Library — add with jest-expo in Phase 1.
export default defineConfig(vitestPreset({ coverageInclude: ['src/button-styles.ts'] }));
