import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/modules/*/infrastructure/*.schema.ts', './src/shared/outbox/outbox.schema.ts'],
  out: './drizzle',
});
