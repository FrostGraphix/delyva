import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

/** Drizzle database handle used by infrastructure adapters. */
export type Db = NodePgDatabase;

/** DI token for the pg Pool. */
export const PG_POOL = Symbol('PG_POOL');
/** DI token for the Drizzle {@link Db}. */
export const DB = Symbol('DB');

/** Creates a pg pool with conservative timeouts (poor-network friendly, fail fast). */
export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  });
}

/** A Drizzle transaction handle (a nested `transaction` call opens a SAVEPOINT). */
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Wraps a pool in Drizzle. */
export function createDb(pool: pg.Pool): Db {
  return drizzle(pool);
}
