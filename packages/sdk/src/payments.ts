import {
  type CreateTopUpRequest,
  PROBLEM_CONTENT_TYPE,
  type PaymentIntent,
  PaymentIntentSchema,
  ProblemSchema,
  ROUTES,
  type Wallet,
  WalletSchema,
  type WalletTransactionsPage,
  WalletTransactionsPageSchema,
} from '@delyva/contracts';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { z } from 'zod';
import { ApiError, type DelyvaClientOptions } from './client.js';

/** Options for {@link PaymentsClient}: the base client options plus an access-token source. */
export interface PaymentsClientOptions extends DelyvaClientOptions {
  /** Returns the current access token (read from SecureStore/Keychain by the app). */
  readonly accessToken: () => string | Promise<string>;
}

/** Typed client for wallet and payment-intent endpoints (bearer auth). */
export class PaymentsClient {
  private readonly fetchImpl: typeof fetch;

  /** @param options client options */
  constructor(private readonly options: PaymentsClientOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** GET /v1/wallet */
  getWallet(): Promise<Wallet> {
    return this.send('GET', ROUTES.getWallet.path, WalletSchema);
  }

  /** GET /v1/wallet/transactions */
  listWalletTransactions(
    q: { limit?: number; cursor?: string } = {},
  ): Promise<WalletTransactionsPage> {
    const qs = new URLSearchParams();
    if (q.limit !== undefined) qs.set('limit', String(q.limit));
    if (q.cursor !== undefined) qs.set('cursor', q.cursor);
    const suffix = qs.size > 0 ? `?${qs.toString()}` : '';
    return this.send(
      'GET',
      `${ROUTES.listWalletTransactions.path}${suffix}`,
      WalletTransactionsPageSchema,
    );
  }

  /** POST /v1/wallet/top-ups (pass a stable idempotency key per user intent). */
  createWalletTopUp(body: CreateTopUpRequest, idempotencyKey?: string): Promise<PaymentIntent> {
    return this.send(
      'POST',
      ROUTES.createWalletTopUp.path,
      PaymentIntentSchema,
      body,
      this.key(idempotencyKey),
    );
  }

  /** GET /v1/payment-intents/{id} */
  getPaymentIntent(id: string): Promise<PaymentIntent> {
    return this.send('GET', intentPath(ROUTES.getPaymentIntent.path, id), PaymentIntentSchema);
  }

  /** POST /v1/payment-intents/{id}/verify — ask the server to verify after the checkout redirect. */
  verifyPaymentIntent(id: string, idempotencyKey?: string): Promise<PaymentIntent> {
    return this.send(
      'POST',
      intentPath(ROUTES.verifyPaymentIntent.path, id),
      PaymentIntentSchema,
      undefined,
      this.key(idempotencyKey),
    );
  }

  private key(k?: string): Record<string, string> {
    return { 'Idempotency-Key': k ?? this.options.idempotencyKey?.() ?? crypto.randomUUID() };
  }

  private async send<S extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: S,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<z.infer<S>> {
    const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
      method,
      headers: {
        accept: `application/json, ${PROBLEM_CONTENT_TYPE}`,
        authorization: `Bearer ${await this.options.accessToken()}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
    });
    if (!response.ok) throw new ApiError(await problemOf(response));
    return schema.parse(await response.json());
  }
}

const intentPath = (template: string, id: string): string =>
  template.replace('{id}', encodeURIComponent(id));

async function problemOf(response: Response): Promise<z.infer<typeof ProblemSchema>> {
  const fallback = {
    type: 'about:blank',
    title: 'Request failed',
    status: response.status,
    code: 'internal_error' as const,
  };
  try {
    const parsed = ProblemSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

/** Query keys for payments. */
export const paymentsKeys = {
  all: ['payments'] as const,
  wallet: () => [...paymentsKeys.all, 'wallet'] as const,
  transactions: (cursor?: string) =>
    [...paymentsKeys.all, 'wallet', 'transactions', cursor ?? null] as const,
  intent: (id: string) => [...paymentsKeys.all, 'intent', id] as const,
};

/** Wallet balance (server-derived). */
export function useWallet(client: PaymentsClient): UseQueryResult<Wallet, ApiError> {
  return useQuery({ queryKey: paymentsKeys.wallet(), queryFn: () => client.getWallet() });
}

/** One page of wallet movements. */
export function useWalletTransactions(
  client: PaymentsClient,
  cursor?: string,
): UseQueryResult<WalletTransactionsPage, ApiError> {
  return useQuery({
    queryKey: paymentsKeys.transactions(cursor),
    queryFn: () => client.listWalletTransactions(cursor === undefined ? {} : { cursor }),
  });
}

/** Starts a wallet top-up; open `authorizationUrl` then call {@link useVerifyPaymentIntent}. */
export function useCreateWalletTopUp(
  client: PaymentsClient,
): UseMutationResult<PaymentIntent, ApiError, CreateTopUpRequest & { idempotencyKey?: string }> {
  return useMutation({
    mutationKey: [...paymentsKeys.all, 'top-up'],
    mutationFn: ({ idempotencyKey, ...body }) => client.createWalletTopUp(body, idempotencyKey),
  });
}

/** Server-side verification of an intent (never trust the redirect alone). */
export function useVerifyPaymentIntent(
  client: PaymentsClient,
): UseMutationResult<PaymentIntent, ApiError, { id: string; idempotencyKey?: string }> {
  return useMutation({
    mutationKey: [...paymentsKeys.all, 'verify'],
    mutationFn: ({ id, idempotencyKey }) => client.verifyPaymentIntent(id, idempotencyKey),
  });
}
