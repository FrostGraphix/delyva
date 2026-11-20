import { z } from 'zod';

/** Currencies accepted by the payments context (NGN at launch). */
export const PaymentCurrencySchema = z.enum(['NGN']);
/** Payment currency. */
export type PaymentCurrency = z.infer<typeof PaymentCurrencySchema>;

/** Signed integer minor units (kobo); negative for debits in wallet history. Never a float. */
export const SignedAmountMinorSchema = z.number().int();

/** Money on the wire: integer minor units plus ISO 4217 code. */
export const MoneyDtoSchema = z.strictObject({
  amountMinor: SignedAmountMinorSchema,
  currency: PaymentCurrencySchema,
});
/** Money on the wire. */
export type MoneyDto = z.infer<typeof MoneyDtoSchema>;

/** Payment method chosen by the customer. */
export const PaymentMethodSchema = z.enum(['card', 'transfer', 'wallet']);
/** Payment method. */
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

/** Payment intent lifecycle states. */
export const PAYMENT_INTENT_STATUSES = [
  'requires_action',
  'processing',
  'succeeded',
  'failed',
  'refunded',
] as const;
/** Payment intent status. */
export const PaymentIntentStatusSchema = z.enum(PAYMENT_INTENT_STATUSES);
/** Payment intent status. */
export type PaymentIntentStatus = z.infer<typeof PaymentIntentStatusSchema>;

/** Smallest wallet top-up: ₦100.00. */
export const MIN_TOP_UP_MINOR = 10_000;
/** Largest single wallet top-up: ₦500,000.00. */
export const MAX_TOP_UP_MINOR = 50_000_000;

/** POST /v1/wallet/top-ups body. */
export const CreateTopUpRequestSchema = z.strictObject({
  amountMinor: z.number().int().min(MIN_TOP_UP_MINOR).max(MAX_TOP_UP_MINOR),
  method: z.enum(['card', 'transfer']),
});
/** POST /v1/wallet/top-ups body. */
export type CreateTopUpRequest = z.infer<typeof CreateTopUpRequestSchema>;

/** A payment intent as seen by its owner. */
export const PaymentIntentSchema = z.strictObject({
  id: z.uuid(),
  purpose: z.enum(['wallet_top_up', 'order']),
  orderId: z.string().nullable(),
  amount: MoneyDtoSchema,
  method: PaymentMethodSchema,
  status: PaymentIntentStatusSchema,
  reference: z.string(),
  authorizationUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
/** A payment intent. */
export type PaymentIntent = z.infer<typeof PaymentIntentSchema>;

/** GET /v1/wallet response. Balance is derived from the ledger. */
export const WalletSchema = z.strictObject({
  balance: MoneyDtoSchema,
  held: MoneyDtoSchema,
  available: MoneyDtoSchema,
});
/** Wallet summary. */
export type Wallet = z.infer<typeof WalletSchema>;

/** One wallet ledger movement (credit positive, debit negative from the customer's view). */
export const WalletTransactionSchema = z.strictObject({
  id: z.string(),
  kind: z.string(),
  amount: MoneyDtoSchema,
  reference: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
/** Wallet movement. */
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

/** GET /v1/wallet/transactions query. */
export const WalletTransactionsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(64).optional(),
});
/** GET /v1/wallet/transactions query. */
export type WalletTransactionsQuery = z.infer<typeof WalletTransactionsQuerySchema>;

/** GET /v1/wallet/transactions response (newest first, cursor paginated). */
export const WalletTransactionsPageSchema = z.strictObject({
  items: z.array(WalletTransactionSchema),
  nextCursor: z.string().nullable(),
});
/** Wallet movements page. */
export type WalletTransactionsPage = z.infer<typeof WalletTransactionsPageSchema>;

/** Webhook acknowledgement. */
export const WebhookAckSchema = z.strictObject({
  received: z.literal(true),
  duplicate: z.boolean(),
});
/** Webhook acknowledgement. */
export type WebhookAck = z.infer<typeof WebhookAckSchema>;

/** Internal job: POST /internal/payments/payouts/run body (workers to API, not public). */
export const RunPayoutBatchRequestSchema = z.strictObject({
  batchId: z.string().regex(/^[a-z0-9-]{4,40}$/, 'lowercase alphanumeric and -'),
});
/** Internal payout batch request. */
export type RunPayoutBatchRequest = z.infer<typeof RunPayoutBatchRequestSchema>;

/** Internal job: POST /internal/payments/reconciliations/run body (UTC day). */
export const RunReconciliationRequestSchema = z.strictObject({ date: z.iso.date() });
/** Internal reconciliation request. */
export type RunReconciliationRequest = z.infer<typeof RunReconciliationRequestSchema>;

/** Internal job endpoint paths (not part of the public OpenAPI document). */
export const INTERNAL_PAYMENT_PATHS = {
  runPayouts: '/internal/payments/payouts/run',
  runReconciliation: '/internal/payments/reconciliations/run',
} as const;
