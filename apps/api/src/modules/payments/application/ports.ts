import type { WalletTransaction } from '@delyva/contracts';
import type { CurrencyCode, Money } from '@delyva/utils';
import type { Journal, JournalLine } from '../domain/ledger.js';
import type { PaymentIntentState, VerifiedCharge } from '../domain/payment-intent.js';
import type { SettledCharge } from '../domain/reconciliation.js';
import type { WalletView } from '../domain/wallet.js';

/** Payment channels the provider checkout should offer. */
export type ProviderChannel = 'card' | 'bank_transfer';

/** Payment service provider adapter (Paystack, Fake). Secrets are injected from env only. */
export interface PaymentProvider {
  /** Stable provider name, used in account codes and webhook dedupe. */
  readonly name: string;
  /** Starts a hosted checkout. */
  initialize(input: {
    reference: string;
    amount: Money;
    email: string;
    channels: readonly ProviderChannel[];
    metadata: Record<string, string>;
  }): Promise<{ authorizationUrl: string; reference: string }>;
  /** Server-side verification of a charge by our reference. */
  verify(reference: string): Promise<VerifiedCharge>;
  /** Refunds (part of) a charge. */
  refund(input: { reference: string; amount: Money }): Promise<{ providerRefundId: string }>;
  /** Creates a transfer recipient for payouts. */
  createTransferRecipient(input: {
    name: string;
    accountNumber: string;
    bankCode: string;
    currency: CurrencyCode;
  }): Promise<{ recipientCode: string }>;
  /** Sends a transfer; `reference` makes it idempotent at the provider. */
  transfer(input: {
    amount: Money;
    recipientCode: string;
    reference: string;
    reason: string;
  }): Promise<{ transferCode: string; status: string }>;
  /** Resolves an account number to its registered name. */
  resolveBankAccount(input: {
    accountNumber: string;
    bankCode: string;
  }): Promise<{ accountNumber: string; accountName: string }>;
  /** Successful charges in [from, to) for reconciliation. */
  listSuccessfulCharges(input: { from: Date; to: Date }): Promise<SettledCharge[]>;
}

/** Normalised webhook event. */
export interface ProviderWebhookEvent {
  /** Dedupe key, unique per provider. */
  readonly eventId: string;
  readonly type: string;
  /** Charge or transfer reference, when present. */
  readonly reference: string | null;
}

/** Verifies and parses provider webhooks. */
export interface WebhookVerifier {
  /** Constant-time HMAC check of the raw body. */
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean;
  /** Parses a verified raw body; null when malformed. */
  parse(rawBody: Buffer): ProviderWebhookEvent | null;
}

/** A wallet hold row. */
export interface WalletHold {
  readonly id: string;
  readonly userId: string;
  readonly reference: string;
  readonly amount: Money;
  readonly status: 'active' | 'captured' | 'released';
  readonly expiresAt: Date;
}

/** A posted ledger line with account code, used to rebuild order legs. */
export interface PostedLine extends JournalLine {
  readonly kind: string;
}

/** Payout row. */
export interface PayoutRow {
  readonly id: string;
  readonly batchId: string;
  readonly account: string;
  readonly amount: Money;
  readonly reference: string;
  readonly status: 'pending' | 'sent' | 'completed' | 'failed' | 'skipped';
}

/** Domain event to append to the outbox. */
export interface PaymentsEvent {
  readonly type: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: unknown;
}

/** Operations available inside one database transaction. */
export interface PaymentsTx {
  /** Serialises all wallet-changing work for a user (advisory xact lock). */
  lockWallet(userId: string): Promise<void>;
  /** Serialises work on an arbitrary key (advisory xact lock). */
  lockKey(key: string): Promise<void>;
  /** Loads an intent with FOR UPDATE. */
  lockIntent(id: string): Promise<PaymentIntentState | null>;
  /** Loads an intent by reference with FOR UPDATE. */
  lockIntentByReference(reference: string): Promise<PaymentIntentState | null>;
  /** Loads the newest non-failed intent of an order. */
  findOrderIntent(orderId: string): Promise<PaymentIntentState | null>;
  /** Inserts a new intent. */
  insertIntent(intent: PaymentIntentState): Promise<void>;
  /** Persists status/failure changes. */
  updateIntent(intent: PaymentIntentState, providerTransactionId?: string): Promise<void>;
  /** Posts a journal; a repeated idempotency key is a no-op returning the original id. */
  post(journal: Journal): Promise<{ transactionId: string; created: boolean }>;
  /** Wallet figures (call after lockWallet for a consistent view). */
  walletView(userId: string, currency: CurrencyCode, now: Date): Promise<WalletView>;
  /** Hold by reference with FOR UPDATE. */
  lockHold(reference: string): Promise<WalletHold | null>;
  /** Inserts a hold. */
  insertHold(hold: WalletHold): Promise<void>;
  /** Updates a hold's status. */
  setHoldStatus(id: string, status: WalletHold['status']): Promise<void>;
  /** Records a webhook event id; false when it was already recorded. */
  recordWebhookEvent(provider: string, eventId: string, type: string): Promise<boolean>;
  /** All ledger lines posted against an order reference. */
  orderLines(orderId: string): Promise<PostedLine[]>;
  /** Inserts a refund row. */
  insertRefund(row: {
    id: string;
    orderId: string;
    amount: Money;
    destination: 'wallet' | 'source';
    status: 'completed' | 'pending_provider';
    reason: string;
  }): Promise<void>;
  /** Updates a refund after the provider call. */
  updateRefund(id: string, status: string, providerRefundId: string | null): Promise<void>;
  /** Inserts a payout if its reference is new; returns the stored row either way. */
  upsertPayout(row: PayoutRow): Promise<PayoutRow>;
  /** Updates payout status. */
  updatePayout(
    id: string,
    status: PayoutRow['status'],
    transferCode: string | null,
    error: string | null,
  ): Promise<void>;
  /** Payout by provider reference with FOR UPDATE. */
  lockPayoutByReference(reference: string): Promise<PayoutRow | null>;
  /** Ledger lines of a transaction posted under an idempotency key. */
  journalLines(idempotencyKey: string): Promise<{ id: string; lines: JournalLine[] } | null>;
  /** Appends a domain event to the outbox in this transaction. */
  appendEvent(event: PaymentsEvent): Promise<void>;
}

/** Payments persistence (unit of work + read models). */
export interface PaymentsStore {
  /** Runs `fn` in one serialisable-enough DB transaction (READ COMMITTED + explicit locks). */
  transaction<T>(fn: (tx: PaymentsTx) => Promise<T>): Promise<T>;
  /** Intent by id (no lock). */
  findIntent(id: string): Promise<PaymentIntentState | null>;
  /** Wallet figures without locking (eventually consistent read). */
  walletView(userId: string, currency: CurrencyCode, now: Date): Promise<WalletView>;
  /** Wallet movements, newest first. */
  walletTransactions(
    userId: string,
    currency: CurrencyCode,
    limit: number,
    cursor: string | undefined,
  ): Promise<{ items: WalletTransaction[]; nextCursor: string | null }>;
  /** Positive balances of every payable account of a type. */
  payableBalances(
    type: 'vendor_payable' | 'rider_payable',
    currency: CurrencyCode,
  ): Promise<{ account: string; payeeId: string; balance: Money }[]>;
  /** Provider recipient code for a payee account. */
  recipientFor(account: string): Promise<string | null>;
  /** Provider-settled intents with settled_at in [from, to). */
  settledCharges(provider: string, from: Date, to: Date): Promise<SettledCharge[]>;
}

/** Clock and id source, injectable for tests. */
export interface Clock {
  /** Current time. */
  now(): Date;
  /** New UUID v4. */
  uuid(): string;
}

/** Minimal structured logger port (pino-compatible). */
export interface PaymentsLogger {
  /** Info log. */
  info(obj: object, msg: string): void;
  /** Warning log. */
  warn(obj: object, msg: string): void;
  /** Error log. */
  error(obj: object, msg: string): void;
}
