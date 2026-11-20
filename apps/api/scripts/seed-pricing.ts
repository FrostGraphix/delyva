import { fileURLToPath } from 'node:url';
import { seedPricing } from '../src/modules/pricing/infrastructure/pricing.seed.js';
import { createDb, createPool } from '../src/shared/database/database.js';

/** Seeds Lagos fee/surge rules and launch promos (idempotent). */
export async function runPricingSeed(databaseUrl: string): Promise<void> {
  const pool = createPool(databaseUrl);
  try {
    await seedPricing(createDb(pool));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  await runPricingSeed(url);
  process.stdout.write('pricing seed applied\n');
}
