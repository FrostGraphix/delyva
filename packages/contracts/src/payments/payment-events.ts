import { z } from 'zod';
import { MoneyDtoSchema } from './payments.js';

/** Event type names emitted by the payments context. */
export const PAYMENTS_EVENTS = {
  intentSucceeded: 'payments.intent.succeeded',
  intentFailed: 'payments.intent.failed',
  refundCompleted: 'payments.refund.completed',
  payoutSent: 'payments.payout.sent',
  reconciliationMismatched: 'payments.reconciliation.mismatched',
} as const;

/** Payload of `payments.intent.succeeded`. */
export const IntentSucceededPayloadSchema = z.object({
  intentId: z.uuid(),
  userId: z.uuid(),
  orderId: z.string().nullable(),
  amount: MoneyDtoSchema,
});
/** Payload of `payments.intent.succeeded`. */
export type IntentSucceededPayload = z.infer<typeof IntentSucceededPayloadSchema>;

/** Payload of `payments.intent.failed`. */
export const IntentFailedPayloadSchema = z.object({
  intentId: z.uuid(),
  userId: z.uuid(),
  orderId: z.string().nullable(),
  reason: z.string(),
});
/** Payload of `payments.intent.failed`. */
export type IntentFailedPayload = z.infer<typeof IntentFailedPayloadSchema>;

/** Payload of `payments.refund.completed`. */
export const RefundCompletedPayloadSchema = z.object({
  refundId: z.uuid(),
  orderId: z.string(),
  amount: MoneyDtoSchema,
  destination: z.enum(['wallet', 'source']),
});
/** Payload of `payments.refund.completed`. */
export type RefundCompletedPayload = z.infer<typeof RefundCompletedPayloadSchema>;

/** Payload of `payments.payout.sent`. */
export const PayoutSentPayloadSchema = z.object({
  payoutId: z.uuid(),
  batchId: z.string(),
  payeeAccount: z.string(),
  amount: MoneyDtoSchema,
});
/** Payload of `payments.payout.sent`. */
export type PayoutSentPayload = z.infer<typeof PayoutSentPayloadSchema>;

/** Payload of `payments.reconciliation.mismatched`. */
export const ReconciliationMismatchedPayloadSchema = z.object({
  date: z.iso.date(),
  mismatches: z.array(
    z.object({
      reference: z.string(),
      kind: z.enum(['missing_in_ledger', 'missing_at_provider', 'amount_mismatch']),
    }),
  ),
});
/** Payload of `payments.reconciliation.mismatched`. */
export type ReconciliationMismatchedPayload = z.infer<typeof ReconciliationMismatchedPayloadSchema>;
