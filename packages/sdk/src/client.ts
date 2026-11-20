import {
  type LogoutRequest,
  type OtpRequest,
  type OtpRequestResponse,
  OtpRequestResponseSchema,
  type OtpVerify,
  PROBLEM_CONTENT_TYPE,
  type Problem,
  ProblemSchema,
  type RefreshRequest,
  ROUTES,
  type TokenPair,
  TokenPairSchema,
  type CreateFeeRule,
  type CreatePromo,
  type FeeRule,
  type FeeRuleList,
  FeeRuleListSchema,
  FeeRuleSchema,
  type Promo,
  type PromoList,
  PromoListSchema,
  PromoSchema,
  type QuoteRequest,
  type QuoteResponse,
  QuoteResponseSchema,
  type UpdateFeeRule,
  type UpdatePromo,
  type CreateTopUpRequest,
  type PaymentIntent,
  PaymentIntentSchema,
  type Wallet,
  WalletSchema,
  type WalletTransactionsPage,
  WalletTransactionsPageSchema,
} from '@delyva/contracts';
import type { z } from 'zod';

const withId = (path: string, id: string): string => path.replace('{id}', encodeURIComponent(id));

/** Thrown for any non-2xx response; carries the parsed RFC 9457 problem. */
export class ApiError extends Error {
  /** @param problem parsed problem details */
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }
}

/** Client options. */
export interface DelyvaClientOptions {
  /** API origin, e.g. `https://api.delyva.ng` (from app config, never hardcoded). */
  readonly baseUrl: string;
  /** Injectable fetch (tests, RN polyfills). */
  readonly fetch?: typeof fetch;
  /** Per-request timeout; defaults to 15 s for poor networks. */
  readonly timeoutMs?: number;
  /** Generates idempotency keys for write calls. */
  readonly idempotencyKey?: () => string;
  /** Current access token (from SecureStore); sent as a Bearer token when present. */
  readonly accessToken?: () => string | null | undefined;
}

const fallbackProblem = (status: number): Problem => ({
  type: 'about:blank',
  title: 'Request failed',
  status: status >= 400 && status <= 599 ? status : 500,
  code: 'internal_error',
});

/** Typed client for the Delyva auth endpoints, validated against the shared contracts. */
export class DelyvaClient {
  private readonly fetchImpl: typeof fetch;

  /** @param options client options */
  constructor(private readonly options: DelyvaClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** POST /v1/auth/otp/request */
  requestOtp(body: OtpRequest, idempotencyKey?: string): Promise<OtpRequestResponse> {
    const key = idempotencyKey ?? this.options.idempotencyKey?.() ?? crypto.randomUUID();
    return this.post(ROUTES.requestOtp.path, body, OtpRequestResponseSchema, {
      'Idempotency-Key': key,
    });
  }

  /** POST /v1/auth/otp/verify */
  verifyOtp(body: OtpVerify): Promise<TokenPair> {
    return this.post(ROUTES.verifyOtp.path, body, TokenPairSchema);
  }

  /** POST /v1/auth/refresh */
  refresh(body: RefreshRequest): Promise<TokenPair> {
    return this.post(ROUTES.refresh.path, body, TokenPairSchema);
  }

  /** POST /v1/auth/logout */
  async logout(body: LogoutRequest): Promise<void> {
    await this.post(ROUTES.logout.path, body, null);
  }

  /** POST /v1/quotes — server-computed price breakdown. */
  createQuote(body: QuoteRequest): Promise<QuoteResponse> {
    return this.post(ROUTES.createQuote.path, body, QuoteResponseSchema);
  }

  /** GET /v1/admin/fee-rules */
  listFeeRules(): Promise<FeeRuleList> {
    return this.send('GET', ROUTES.listFeeRules.path, undefined, FeeRuleListSchema);
  }

  /** POST /v1/admin/fee-rules */
  createFeeRule(body: CreateFeeRule, idempotencyKey?: string): Promise<FeeRule> {
    return this.post(ROUTES.createFeeRule.path, body, FeeRuleSchema, this.idem(idempotencyKey));
  }

  /** PATCH /v1/admin/fee-rules/{id} */
  updateFeeRule(id: string, body: UpdateFeeRule): Promise<FeeRule> {
    return this.send('PATCH', withId(ROUTES.updateFeeRule.path, id), body, FeeRuleSchema);
  }

  /** GET /v1/admin/promos */
  listPromos(): Promise<PromoList> {
    return this.send('GET', ROUTES.listPromos.path, undefined, PromoListSchema);
  }

  /** POST /v1/admin/promos */
  createPromo(body: CreatePromo, idempotencyKey?: string): Promise<Promo> {
    return this.post(ROUTES.createPromo.path, body, PromoSchema, this.idem(idempotencyKey));
  }

  /** PATCH /v1/admin/promos/{id} */
  updatePromo(id: string, body: UpdatePromo): Promise<Promo> {
    return this.send('PATCH', withId(ROUTES.updatePromo.path, id), body, PromoSchema);
  }

  /** GET /v1/wallet (bearer) */
  getWallet(): Promise<Wallet> {
    return this.send('GET', ROUTES.getWallet.path, undefined, WalletSchema);
  }

  /** GET /v1/wallet/transactions (bearer) */
  listWalletTransactions(
    q: { limit?: number; cursor?: string } = {},
  ): Promise<WalletTransactionsPage> {
    const qs = new URLSearchParams();
    if (q.limit !== undefined) qs.set('limit', String(q.limit));
    if (q.cursor !== undefined) qs.set('cursor', q.cursor);
    const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
    const path = `${ROUTES.listWalletTransactions.path}${suffix}`;
    return this.send('GET', path, undefined, WalletTransactionsPageSchema);
  }

  /** POST /v1/wallet/top-ups (bearer; stable idempotency key per user intent) */
  createWalletTopUp(body: CreateTopUpRequest, idempotencyKey?: string): Promise<PaymentIntent> {
    return this.post(
      ROUTES.createWalletTopUp.path,
      body,
      PaymentIntentSchema,
      this.idem(idempotencyKey),
    );
  }

  /** GET /v1/payment-intents/{id} (bearer) */
  getPaymentIntent(id: string): Promise<PaymentIntent> {
    return this.send(
      'GET',
      withId(ROUTES.getPaymentIntent.path, id),
      undefined,
      PaymentIntentSchema,
    );
  }

  /** POST /v1/payment-intents/{id}/verify (bearer) — server-side verify after checkout redirect */
  verifyPaymentIntent(id: string, idempotencyKey?: string): Promise<PaymentIntent> {
    return this.post(
      withId(ROUTES.verifyPaymentIntent.path, id),
      undefined,
      PaymentIntentSchema,
      this.idem(idempotencyKey),
    );
  }

  private idem(key?: string): Record<string, string> {
    return { 'Idempotency-Key': key ?? this.options.idempotencyKey?.() ?? crypto.randomUUID() };
  }

  private post<S extends z.ZodType>(
    path: string,
    body: unknown,
    schema: S | null,
    headers: Record<string, string> = {},
  ): Promise<z.infer<S>> {
    return this.send('POST', path, body, schema, headers);
  }

  private async send<S extends z.ZodType>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body: unknown,
    schema: S | null,
    headers: Record<string, string> = {},
  ): Promise<z.infer<S>> {
    const token = this.options.accessToken?.();
    const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        accept: `application/json, ${PROBLEM_CONTENT_TYPE}`,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
    });
    if (!response.ok) throw new ApiError(await parseProblem(response));
    if (schema === null) return undefined as z.infer<S>;
    return schema.parse(await response.json());
  }
}

async function parseProblem(response: Response): Promise<Problem> {
  try {
    const parsed = ProblemSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : fallbackProblem(response.status);
  } catch {
    return fallbackProblem(response.status);
  }
}
