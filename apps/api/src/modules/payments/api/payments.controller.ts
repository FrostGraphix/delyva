import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  type CreateTopUpRequest,
  CreateTopUpRequestSchema,
  type PaymentIntent,
  type RunPayoutBatchRequest,
  RunPayoutBatchRequestSchema,
  type RunReconciliationRequest,
  RunReconciliationRequestSchema,
  type Wallet,
  type WalletTransactionsPage,
  type WalletTransactionsQuery,
  WalletTransactionsQuerySchema,
  type WebhookAck,
} from '@delyva/contracts';
import type { Request } from 'express';
import { AppError } from '../../../shared/errors/app-error.js';
import { Idempotent } from '../../../shared/idempotency/idempotency.interceptor.js';
import { ZodBodyPipe } from '../../../shared/validation/zod-body.pipe.js';
import { HandleProviderWebhook } from '../application/handle-webhook.use-case.js';
import { CreateTopUp, GetIntent, VerifyIntent } from '../application/payment-intents.use-cases.js';
import { type PayoutBatchReport, RunPayoutBatch } from '../application/payouts.use-cases.js';
import { RunReconciliation } from '../application/reconciliation.use-case.js';
import { GetWallet, ListWalletTransactions } from '../application/wallet.queries.js';
import {
  BearerAuthGuard,
  CurrentPrincipal,
  InternalJobGuard,
  type Principal,
} from './auth.guards.js';

const uuid = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () => new AppError('not_found', 'Payment not found.'),
});

/** Wallet and payment intent endpoints (v1, bearer auth, owner-scoped). */
@Controller()
@UseGuards(BearerAuthGuard)
export class WalletController {
  /** Injected use cases. */
  constructor(
    private readonly getWallet: GetWallet,
    private readonly listTransactions: ListWalletTransactions,
    private readonly createTopUp: CreateTopUp,
    private readonly getIntent: GetIntent,
    private readonly verifyIntent: VerifyIntent,
  ) {}

  /** GET /v1/wallet */
  @Get('v1/wallet')
  wallet(@CurrentPrincipal() p: Principal): Promise<Wallet> {
    return this.getWallet.execute(p.userId);
  }

  /** GET /v1/wallet/transactions */
  @Get('v1/wallet/transactions')
  transactions(
    @CurrentPrincipal() p: Principal,
    @Query(new ZodBodyPipe(WalletTransactionsQuerySchema)) q: WalletTransactionsQuery,
  ): Promise<WalletTransactionsPage> {
    return this.listTransactions.execute({ userId: p.userId, limit: q.limit, cursor: q.cursor });
  }

  /** POST /v1/wallet/top-ups */
  @Post('v1/wallet/top-ups')
  @HttpCode(201)
  @Idempotent()
  topUp(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodBodyPipe(CreateTopUpRequestSchema)) body: CreateTopUpRequest,
  ): Promise<PaymentIntent> {
    return this.createTopUp.execute({ userId: p.userId, ...body });
  }

  /** GET /v1/payment-intents/{id} */
  @Get('v1/payment-intents/:id')
  intent(@CurrentPrincipal() p: Principal, @Param('id', uuid) id: string): Promise<PaymentIntent> {
    return this.getIntent.execute({ userId: p.userId, intentId: id });
  }

  /** POST /v1/payment-intents/{id}/verify */
  @Post('v1/payment-intents/:id/verify')
  @HttpCode(200)
  @Idempotent()
  verify(@CurrentPrincipal() p: Principal, @Param('id', uuid) id: string): Promise<PaymentIntent> {
    return this.verifyIntent.execute({ userId: p.userId, intentId: id });
  }
}

/** Provider webhooks (signature-verified, no bearer auth). */
@Controller()
export class WebhooksController {
  /** @param handle webhook use case */
  constructor(private readonly handle: HandleProviderWebhook) {}

  /** POST /v1/webhooks/paystack — HMAC-SHA512 over the raw body. */
  @Post('v1/webhooks/paystack')
  @HttpCode(200)
  paystack(@Req() req: RawBodyRequest<Request>): Promise<WebhookAck> {
    if (!req.rawBody) throw new AppError('validation_failed', 'Body is required.');
    return this.handle.execute({
      rawBody: req.rawBody,
      signature: req.header('x-paystack-signature'),
      ip: req.ip ?? 'unknown',
    });
  }
}

/** Internal job triggers called by apps/workers (shared-token guarded, not in public OpenAPI). */
@Controller()
@UseGuards(InternalJobGuard)
export class InternalPaymentsController {
  /** Injected use cases. */
  constructor(
    private readonly payouts: RunPayoutBatch,
    private readonly reconciliation: RunReconciliation,
  ) {}

  /** POST /internal/payments/payouts/run */
  @Post('internal/payments/payouts/run')
  @HttpCode(200)
  runPayouts(
    @Body(new ZodBodyPipe(RunPayoutBatchRequestSchema)) b: RunPayoutBatchRequest,
  ): Promise<PayoutBatchReport> {
    return this.payouts.execute(b.batchId);
  }

  /** POST /internal/payments/reconciliations/run */
  @Post('internal/payments/reconciliations/run')
  @HttpCode(200)
  async runReconciliation(
    @Body(new ZodBodyPipe(RunReconciliationRequestSchema)) b: RunReconciliationRequest,
  ): Promise<{ date: string; mismatches: number }> {
    const r = await this.reconciliation.execute(b.date);
    return { date: r.date, mismatches: r.mismatches.length };
  }
}
