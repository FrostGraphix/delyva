import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const money = (name: string) => bigint(name, { mode: 'number' });
const ts = (name: string) => timestamp(name, { withTimezone: true });

/** Ledger accounts, one per (code, currency). Codes look like `customer_wallet:<userId>`. */
export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey(),
    code: text('code').notNull(),
    type: text('type').notNull(),
    ownerId: text('owner_id'),
    currency: text('currency').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ledger_accounts_code_currency_uq').on(t.code, t.currency),
    index('ledger_accounts_type_idx').on(t.type),
  ],
);

/** Journal transactions (append-only). */
export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id').primaryKey(),
    kind: text('kind').notNull(),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    reference: text('reference').notNull(),
    reversesId: uuid('reverses_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('ledger_transactions_reference_idx').on(t.reference)],
);

/** Journal entries (append-only). Positive = debit, negative = credit; integer minor units. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => ledgerTransactions.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id),
    amountMinor: money('amount_minor').notNull(),
    currency: text('currency').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('ledger_entries_account_idx').on(t.accountId, t.id),
    index('ledger_entries_transaction_idx').on(t.transactionId),
    check('ledger_entries_amount_nonzero', sql`${t.amountMinor} <> 0`),
  ],
);

/** Payment intents. Status changes only via verified webhook or server-side verify. */
export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    purpose: text('purpose').notNull(),
    orderId: text('order_id'),
    amountMinor: money('amount_minor').notNull(),
    currency: text('currency').notNull(),
    method: text('method').notNull(),
    status: text('status').notNull(),
    provider: text('provider').notNull(),
    reference: text('reference').notNull().unique(),
    authorizationUrl: text('authorization_url'),
    failureReason: text('failure_reason'),
    providerTransactionId: text('provider_transaction_id'),
    settledAt: ts('settled_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payment_intents_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('payment_intents_open_order_uq')
      .on(t.orderId)
      .where(sql`${t.orderId} IS NOT NULL AND ${t.status} <> 'failed'`),
    check('payment_intents_amount_positive', sql`${t.amountMinor} > 0`),
    check(
      'payment_intents_status_valid',
      sql`${t.status} IN ('requires_action','processing','succeeded','failed','refunded')`,
    ),
  ],
);

/** Provider webhook deliveries, deduplicated by (provider, event_id). */
export const webhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: uuid('id').primaryKey(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payment_webhook_events_uq').on(t.provider, t.eventId)],
);

/** Wallet holds (reservations) for checkout. Mutable status; money moves only via the ledger. */
export const walletHolds = pgTable(
  'wallet_holds',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    reference: text('reference').notNull(),
    amountMinor: money('amount_minor').notNull(),
    currency: text('currency').notNull(),
    status: text('status').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('wallet_holds_reference_uq').on(t.reference),
    index('wallet_holds_user_active_idx')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    check('wallet_holds_amount_positive', sql`${t.amountMinor} > 0`),
    check('wallet_holds_status_valid', sql`${t.status} IN ('active','captured','released')`),
  ],
);

/** Order refunds. */
export const paymentRefunds = pgTable(
  'payment_refunds',
  {
    id: uuid('id').primaryKey(),
    orderId: text('order_id').notNull(),
    amountMinor: money('amount_minor').notNull(),
    currency: text('currency').notNull(),
    destination: text('destination').notNull(),
    status: text('status').notNull(),
    reason: text('reason').notNull(),
    providerRefundId: text('provider_refund_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payment_refunds_order_idx').on(t.orderId),
    check('payment_refunds_amount_positive', sql`${t.amountMinor} > 0`),
  ],
);

/** Provider transfer recipients for payees (vendors, riders). */
export const payoutRecipients = pgTable('payout_recipients', {
  account: text('account').primaryKey(),
  recipientCode: text('recipient_code').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

/** Payouts; `reference` is the provider idempotency reference. */
export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey(),
    batchId: text('batch_id').notNull(),
    account: text('account').notNull(),
    amountMinor: money('amount_minor').notNull(),
    currency: text('currency').notNull(),
    reference: text('reference').notNull().unique(),
    status: text('status').notNull(),
    transferCode: text('transfer_code'),
    lastError: text('last_error'),
    meta: jsonb('meta'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('payouts_batch_idx').on(t.batchId),
    check('payouts_amount_positive', sql`${t.amountMinor} > 0`),
  ],
);
