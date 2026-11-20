import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Immutable audit log of admin actions. Append-only: UPDATE/DELETE/TRUNCATE are rejected by
 * triggers in migration 0700 (same pattern as the ledger). `actor_id` is an identity user id
 * (no cross-context FK).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    actorId: uuid('actor_id').notNull(),
    actorRoles: text('actor_roles').array().notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    reason: text('reason'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_target_idx').on(t.targetType, t.targetId, t.createdAt),
    index('audit_log_actor_idx').on(t.actorId, t.createdAt),
    check('audit_log_action_chk', sql`length(${t.action}) BETWEEN 1 AND 100`),
  ],
);

/** Server-side feature flags / kill switches. */
export const featureFlags = pgTable(
  'feature_flags',
  {
    key: text('key').primaryKey(),
    enabled: boolean('enabled').notNull(),
    description: text('description').notNull().default(''),
    updatedBy: uuid('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('feature_flags_key_chk', sql`${t.key} ~ '^[a-z][a-z0-9_.-]{1,63}$'`)],
);

/** TOTP second factors of admin users. `secret_ciphertext` is AES-256-GCM field-encrypted. */
export const adminTotpFactors = pgTable('admin_totp_factors', {
  userId: uuid('user_id').primaryKey(),
  secretCiphertext: text('secret_ciphertext').notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  lastUsedStep: bigint('last_used_step', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
