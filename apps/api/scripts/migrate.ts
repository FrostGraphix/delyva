import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb, createPool } from '../src/shared/database/database.js';

/** Applies SQL migrations from apps/api/drizzle to the given database. */
export async function runMigrations(
  databaseUrl: string,
  migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url)),
): Promise<void> {
  const pool = createPool(databaseUrl);
  try {
    await migrate(createDb(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  await runMigrations(url);
  process.stdout.write('migrations applied\n');
}
