import type {
  OtpRequest,
  OtpRequestResponse,
  OtpVerify,
  RefreshRequest,
  LogoutRequest,
  TokenPair,
} from '@delyva/contracts';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { ApiError, DelyvaClient } from './client.js';

/** Query/mutation keys for the auth endpoints. */
export const authKeys = {
  all: ['auth'] as const,
  requestOtp: () => [...authKeys.all, 'otp', 'request'] as const,
  verifyOtp: () => [...authKeys.all, 'otp', 'verify'] as const,
  refresh: () => [...authKeys.all, 'refresh'] as const,
  logout: () => [...authKeys.all, 'logout'] as const,
};

/** Sends an OTP. Pass a stable idempotency key per user intent so retries on flaky networks are safe. */
export function useRequestOtp(
  client: DelyvaClient,
): UseMutationResult<OtpRequestResponse, ApiError, OtpRequest & { idempotencyKey?: string }> {
  return useMutation({
    mutationKey: authKeys.requestOtp(),
    mutationFn: ({ idempotencyKey, ...body }) => client.requestOtp(body, idempotencyKey),
  });
}

/** Verifies an OTP and returns the token pair (store it only in SecureStore/Keychain). */
export function useVerifyOtp(
  client: DelyvaClient,
): UseMutationResult<TokenPair, ApiError, OtpVerify> {
  return useMutation({
    mutationKey: authKeys.verifyOtp(),
    mutationFn: (body) => client.verifyOtp(body),
  });
}

/** Rotates the refresh token. */
export function useRefreshSession(
  client: DelyvaClient,
): UseMutationResult<TokenPair, ApiError, RefreshRequest> {
  return useMutation({
    mutationKey: authKeys.refresh(),
    mutationFn: (body) => client.refresh(body),
  });
}

/** Logs out (revokes the token family). */
export function useLogout(client: DelyvaClient): UseMutationResult<void, ApiError, LogoutRequest> {
  return useMutation({ mutationKey: authKeys.logout(), mutationFn: (body) => client.logout(body) });
}
