import { defineConfig } from 'vitest/config';
import { vitestPreset } from '@delyva/config/vitest';

export default defineConfig(vitestPreset({ coverageInclude: ['src/button.tsx'] }));
