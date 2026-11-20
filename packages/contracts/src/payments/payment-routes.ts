import type { RouteSpec } from '../openapi.js';
import {
  CreateTopUpRequestSchema,
  PaymentIntentSchema,
  WalletSchema,
  WalletTransactionsPageSchema,
  WebhookAckSchema,
} from './payments.js';

/** Payments routes, spread (append-only) into the main route registry. */
export const PAYMENT_ROUTES = {
  getWallet: {
    method: 'get',
    path: '/v1/wallet',
    operationId: 'getWallet',
    summary: 'Wallet balance derived from the ledger (bearer auth)',
    success: { status: 200, schema: WalletSchema },
    errors: [401],
    auth: true,
  },
  listWalletTransactions: {
    method: 'get',
    path: '/v1/wallet/transactions',
    operationId: 'listWalletTransactions',
    summary: 'Wallet ledger movements, newest first (bearer auth; query limit, cursor)',
    success: { status: 200, schema: WalletTransactionsPageSchema },
    errors: [400, 401],
    auth: true,
  },
  createWalletTopUp: {
    method: 'post',
    path: '/v1/wallet/top-ups',
    operationId: 'createWalletTopUp',
    summary: 'Start a wallet top-up payment intent (bearer auth)',
    body: CreateTopUpRequestSchema,
    success: { status: 201, schema: PaymentIntentSchema },
    errors: [400, 401, 409],
    auth: true,
    idempotent: true,
  },
  getPaymentIntent: {
    method: 'get',
    path: '/v1/payment-intents/{id}',
    operationId: 'getPaymentIntent',
    summary: 'Read one of your payment intents (bearer auth)',
    success: { status: 200, schema: PaymentIntentSchema },
    errors: [401, 404],
    auth: true,
  },
  verifyPaymentIntent: {
    method: 'post',
    path: '/v1/payment-intents/{id}/verify',
    operationId: 'verifyPaymentIntent',
    summary: 'Ask the server to verify the intent with the provider (bearer auth)',
    success: { status: 200, schema: PaymentIntentSchema },
    errors: [401, 404, 409],
    auth: true,
    idempotent: true,
  },
  paystackWebhook: {
    method: 'post',
    path: '/v1/webhooks/paystack',
    operationId: 'paystackWebhook',
    summary: 'Paystack webhook (HMAC-SHA512 x-paystack-signature, allowlisted IPs)',
    success: { status: 200, schema: WebhookAckSchema },
    errors: [400, 401, 403],
  },
} as const satisfies Record<string, RouteSpec>;
