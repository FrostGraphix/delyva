/** Dependencies of {@link createAuthedFetch}. */
export interface AuthedFetchDeps {
  readonly fetch: typeof fetch;
  /** Current access token. */
  readonly accessToken: () => string | null;
  /**
   * Rotates the refresh token and returns the new access token, or null when the session is
   * gone (the caller then signs the user out).
   */
  readonly refresh: () => Promise<string | null>;
}

const AUTH_PATH = '/v1/auth/';

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/**
 * Wraps fetch so a 401 on a bearer call triggers one single-flight refresh and one retry with
 * the new token. Auth endpoints are never retried (no refresh loops).
 */
export function createAuthedFetch(deps: AuthedFetchDeps): typeof fetch {
  let inflight: Promise<string | null> | null = null;
  const refreshOnce = (): Promise<string | null> => {
    inflight ??= deps.refresh().finally(() => {
      inflight = null;
    });
    return inflight;
  };
  return async (input, init) => {
    const response = await deps.fetch(input, init);
    if (response.status !== 401 || urlOf(input).includes(AUTH_PATH)) return response;
    if (deps.accessToken() === null) return response;
    const token = await refreshOnce();
    if (token === null) return response;
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${token}`);
    return deps.fetch(input, { ...init, headers });
  };
}
