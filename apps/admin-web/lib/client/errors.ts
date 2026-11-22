import { ApiError } from '@delyva/sdk';
import { t } from '../i18n';

/** Where an auth failure should send the user, or null when it is an ordinary error. */
export function authRedirectFor(error: unknown): '/login' | '/login?step=2fa' | null {
  if (!(error instanceof ApiError)) return null;
  if (error.problem.code === 'two_factor_required') return '/login?step=2fa';
  if (error.problem.status === 401) return '/login';
  return null;
}

/** True for 4xx errors (not worth retrying). */
export function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.problem.status < 500;
}

/** True when the API refused the caller's role. */
export function isForbidden(error: unknown): boolean {
  return (
    error instanceof ApiError && error.problem.status === 403 && error.problem.code === 'forbidden'
  );
}

/** An error whose message is already plain-language copy safe to show. */
export class DisplayError extends Error {}

/** Plain-language message for an error (problem detail/title, else a generic sentence). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  if (error instanceof DisplayError) return error.message;
  return t('common.unknownError');
}
