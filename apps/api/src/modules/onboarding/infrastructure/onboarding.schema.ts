import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const review = {
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by'),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
const statusCheck = (col: unknown) =>
  sql`${col} IN ('in_progress','pending_review','approved','rejected')`;

/**
 * Rider applications. Step data in `data` (jsonb, no NIN/account number/guarantor phone);
 * those three live only as AES-256-GCM envelopes (`*_ciphertext`, key id inside the envelope).
 */
export const riderApplications = pgTable(
  'rider_applications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().unique(),
    status: text('status').notNull(),
    completedSteps: text('completed_steps')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    version: integer('version').notNull().default(0),
    data: jsonb('data').notNull(),
    ninCiphertext: text('nin_ciphertext'),
    guarantorPhoneCiphertext: text('guarantor_phone_ciphertext'),
    bankAccountCiphertext: text('bank_account_ciphertext'),
    ...review,
  },
  (t) => [
    index('rider_applications_status_idx').on(t.status, t.submittedAt),
    check('rider_applications_status_chk', statusCheck(t.status)),
  ],
);

/** Vendor applications; the catalog vendor/branch/draft menu are referenced by id (no FK). */
export const vendorApplications = pgTable(
  'vendor_applications',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull().unique(),
    vendorId: uuid('vendor_id'),
    branchId: uuid('branch_id'),
    draftMenuId: uuid('draft_menu_id'),
    status: text('status').notNull(),
    completedSteps: text('completed_steps')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    version: integer('version').notNull().default(0),
    data: jsonb('data').notNull(),
    ownerIdCiphertext: text('owner_id_ciphertext'),
    bankAccountCiphertext: text('bank_account_ciphertext'),
    ...review,
  },
  (t) => [
    index('vendor_applications_status_idx').on(t.status, t.submittedAt),
    check('vendor_applications_status_chk', statusCheck(t.status)),
  ],
);

/** Declared private uploads (objects live in S3 / local disk under `storage_key`). */
export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id').notNull(),
    purpose: text('purpose').notNull(),
    contentType: text('content_type').notNull(),
    maxSizeBytes: bigint('max_size_bytes', { mode: 'number' }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    storageKey: text('storage_key').notNull().unique(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
  },
  (t) => [
    index('uploads_owner_idx').on(t.ownerUserId),
    check('uploads_status_chk', sql`${t.status} IN ('pending','verified')`),
  ],
);
