import type {
  CreateTopUpRequest,
  PaymentIntent,
  Wallet,
  WalletTransactionsPage,
} from '@delyva/contracts';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ApiError, DelyvaClient } from './client.js';

/** Query keys for payments. */
export const paymentsKeys = {
  all: ['payments'] as const,
  wallet: () => [...paymentsKeys.all, 'wallet'] as const,
  transactions: (cursor?: string) =>
    [...paymentsKeys.all, 'wallet', 'transactions', cursor ?? null] as const,
  intent: (id: string) => [...paymentsKeys.all, 'intent', id] as const,
};

/** Wallet balance (server-derived from the ledger). */
export function useWallet(client: DelyvaClient): UseQueryResult<Wallet, ApiError> {
  return useQuery({ queryKey: paymentsKeys.wallet(), queryFn: () => client.getWallet() });
}

/** One page of wallet movements. */
export function useWalletTransactions(
  client: DelyvaClient,
  cursor?: string,
): UseQueryResult<WalletTransactionsPage, ApiError> {
  return useQuery({
    queryKey: paymentsKeys.transactions(cursor),
    queryFn: () => client.listWalletTransactions(cursor === undefined ? {} : { cursor }),
  });
}

/** One payment intent (poll after returning from checkout). */
export function usePaymentIntent(
  client: DelyvaClient,
  id: string,
): UseQueryResult<PaymentIntent, ApiError> {
  return useQuery({
    queryKey: paymentsKeys.intent(id),
    queryFn: () => client.getPaymentIntent(id),
  });
}

/** Starts a wallet top-up; open `authorizationUrl`, then call {@link useVerifyPaymentIntent}. */
export function useCreateWalletTopUp(
  client: DelyvaClient,
): UseMutationResult<PaymentIntent, ApiError, CreateTopUpRequest & { idempotencyKey?: string }> {
  return useMutation({
    mutationKey: [...paymentsKeys.all, 'top-up'],
    mutationFn: ({ idempotencyKey, ...body }) => client.createWalletTopUp(body, idempotencyKey),
  });
}

/** Server-side verification of an intent (never trust the redirect alone). */
export function useVerifyPaymentIntent(
  client: DelyvaClient,
): UseMutationResult<PaymentIntent, ApiError, { id: string; idempotencyKey?: string }> {
  return useMutation({
    mutationKey: [...paymentsKeys.all, 'verify'],
    mutationFn: ({ id, idempotencyKey }) => client.verifyPaymentIntent(id, idempotencyKey),
  });
}
