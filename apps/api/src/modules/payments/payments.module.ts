import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { Money } from '@delyva/utils';
import type { Logger } from 'pino';
import { ENV, type Env } from '../../shared/config/env.js';
import { DB, type Db } from '../../shared/database/database.js';
import { LOGGER } from '../../shared/logging/logger.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ACCESS_TOKEN_VERIFIER, AuthGuard } from '../../shared/auth/auth.guard.js';
import { JoseAccessTokenVerifier } from '../../shared/auth/jose-access-token.verifier.js';
import { JoseAccessTokenSigner } from '../identity/infrastructure/jose-access-token.signer.js';
import { InternalJobGuard } from './api/internal-job.guard.js';
import {
  InternalPaymentsController,
  WalletController,
  WebhooksController,
} from './api/payments.controller.js';
import { HandleProviderWebhook } from './application/handle-webhook.use-case.js';
import {
  CaptureOrderSplit,
  RefundOrder,
  ReleaseOrderHold,
} from './application/order-money.use-cases.js';
import {
  CreateIntentForOrder,
  CreateTopUp,
  GetIntent,
  type IntentDeps,
  VerifyIntent,
} from './application/payment-intents.use-cases.js';
import { PaymentsService } from './application/payments.service.js';
import { PayoutTransitions, RunPayoutBatch } from './application/payouts.use-cases.js';
import type { Clock, PaymentProvider, PaymentsStore } from './application/ports.js';
import { RunReconciliation } from './application/reconciliation.use-case.js';
import { GetWallet, ListWalletTransactions } from './application/wallet.queries.js';
import { DrizzlePaymentsStore } from './infrastructure/drizzle-payments.store.js';
import { FakePaymentProvider } from './infrastructure/fake.provider.js';
import { HmacSha512WebhookVerifier } from './infrastructure/hmac-webhook.verifier.js';
import { PaystackProvider } from './infrastructure/paystack.provider.js';

/** DI token for the {@link PaymentProvider}. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
/** DI token for the {@link PaymentsStore}. */
export const PAYMENTS_STORE = Symbol('PAYMENTS_STORE');
const CLOCK = Symbol('PAYMENTS_CLOCK');
const INTENT_DEPS = Symbol('INTENT_DEPS');

const systemClock: Clock = { now: () => new Date(), uuid: () => randomUUID() };

function providerFor(env: Env): PaymentProvider {
  if (env.PAYMENTS_PROVIDER === 'paystack') {
    return new PaystackProvider({
      secretKey: env.PAYSTACK_SECRET_KEY,
      baseUrl: env.PAYSTACK_BASE_URL,
    });
  }
  return new FakePaymentProvider();
}

function webhookSecret(env: Env): string {
  return env.PAYMENTS_PROVIDER === 'paystack'
    ? env.PAYSTACK_SECRET_KEY
    : env.PAYMENTS_FAKE_WEBHOOK_SECRET;
}

/** Payments bounded context: ledger, intents, wallet, webhooks, payouts, reconciliation. */
@Module({
  imports: [IdentityModule],
  controllers: [WalletController, WebhooksController, InternalPaymentsController],
  providers: [
    {
      provide: ACCESS_TOKEN_VERIFIER,
      inject: [JoseAccessTokenSigner, ENV],
      useFactory: (signer: JoseAccessTokenSigner, env: Env) =>
        new JoseAccessTokenVerifier({
          key: signer.verificationKey,
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        }),
    },
    AuthGuard,
    InternalJobGuard,
    { provide: CLOCK, useValue: systemClock },
    { provide: PAYMENT_PROVIDER, inject: [ENV], useFactory: providerFor },
    { provide: PAYMENTS_STORE, inject: [DB], useFactory: (db: Db) => new DrizzlePaymentsStore(db) },
    {
      provide: INTENT_DEPS,
      inject: [PAYMENTS_STORE, PAYMENT_PROVIDER, CLOCK, ENV],
      useFactory: (
        store: PaymentsStore,
        provider: PaymentProvider,
        clock: Clock,
        env: Env,
      ): IntentDeps => ({
        store,
        provider,
        clock,
        // DEBT(payments): Paystack requires an email; users are phone-first — synthetic non-routable address — use the real email once collected.
        customerEmail: (userId) => `${userId}@${env.PAYMENTS_CUSTOMER_EMAIL_DOMAIN}`,
      }),
    },
    {
      provide: CreateTopUp,
      inject: [INTENT_DEPS],
      useFactory: (d: IntentDeps) => new CreateTopUp(d),
    },
    {
      provide: CreateIntentForOrder,
      inject: [INTENT_DEPS],
      useFactory: (d: IntentDeps) => new CreateIntentForOrder(d),
    },
    {
      provide: VerifyIntent,
      inject: [INTENT_DEPS],
      useFactory: (d: IntentDeps) => new VerifyIntent(d),
    },
    {
      provide: GetIntent,
      inject: [PAYMENTS_STORE],
      useFactory: (s: PaymentsStore) => new GetIntent(s),
    },
    {
      provide: GetWallet,
      inject: [PAYMENTS_STORE, CLOCK],
      useFactory: (s: PaymentsStore, c: Clock) => new GetWallet(s, c),
    },
    {
      provide: ListWalletTransactions,
      inject: [PAYMENTS_STORE],
      useFactory: (s: PaymentsStore) => new ListWalletTransactions(s),
    },
    {
      provide: CaptureOrderSplit,
      inject: [PAYMENTS_STORE, CLOCK],
      useFactory: (s: PaymentsStore, c: Clock) => new CaptureOrderSplit(s, c),
    },
    {
      provide: ReleaseOrderHold,
      inject: [PAYMENTS_STORE],
      useFactory: (s: PaymentsStore) => new ReleaseOrderHold(s),
    },
    {
      provide: RefundOrder,
      inject: [PAYMENTS_STORE, PAYMENT_PROVIDER, CLOCK, LOGGER],
      useFactory: (store: PaymentsStore, provider: PaymentProvider, clock: Clock, logger: Logger) =>
        new RefundOrder({ store, provider, clock, logger }),
    },
    { provide: PayoutTransitions, useValue: new PayoutTransitions() },
    {
      provide: HandleProviderWebhook,
      inject: [PAYMENTS_STORE, PAYMENT_PROVIDER, CLOCK, LOGGER, PayoutTransitions, ENV],
      useFactory: (
        store: PaymentsStore,
        provider: PaymentProvider,
        clock: Clock,
        logger: Logger,
        payouts: PayoutTransitions,
        env: Env,
      ) =>
        new HandleProviderWebhook({
          store,
          provider,
          clock,
          logger,
          payouts,
          verifier: new HmacSha512WebhookVerifier(webhookSecret(env)),
          allowedIps: env.PAYSTACK_WEBHOOK_IPS,
        }),
    },
    {
      provide: RunPayoutBatch,
      inject: [PAYMENTS_STORE, PAYMENT_PROVIDER, CLOCK, LOGGER, ENV],
      useFactory: (
        store: PaymentsStore,
        provider: PaymentProvider,
        clock: Clock,
        logger: Logger,
        env: Env,
      ) =>
        new RunPayoutBatch({
          store,
          provider,
          clock,
          logger,
          minimum: Money.ofMinor(env.PAYOUT_MIN_MINOR, 'NGN'),
        }),
    },
    {
      provide: RunReconciliation,
      inject: [PAYMENTS_STORE, PAYMENT_PROVIDER, LOGGER],
      useFactory: (store: PaymentsStore, provider: PaymentProvider, logger: Logger) =>
        new RunReconciliation({ store, provider, logger }),
    },
    {
      provide: PaymentsService,
      inject: [CreateIntentForOrder, CaptureOrderSplit, ReleaseOrderHold, RefundOrder],
      useFactory: (
        createIntent: CreateIntentForOrder,
        capture: CaptureOrderSplit,
        release: ReleaseOrderHold,
        refund: RefundOrder,
      ) => new PaymentsService({ createIntent, capture, release, refund }),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
