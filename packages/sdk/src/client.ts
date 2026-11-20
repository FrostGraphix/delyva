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
  type DeviceRegistration,
  DeviceRegistrationSchema,
  type ListNotificationsQuery,
  type LocationBatchResult,
  LocationBatchResultSchema,
  type NotificationPage,
  NotificationPageSchema,
  type NotificationPreferences,
  NotificationPreferencesSchema,
  type RegisterDevice,
  type RiderLocationBatch,
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

  /** GET /v1/notifications — the caller's inbox. */
  listNotifications(query: ListNotificationsQuery = {}): Promise<NotificationPage> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (typeof v === 'string' || typeof v === 'number') params.set(k, String(v));
    }
    const qs = params.size > 0 ? `?${params.toString()}` : '';
    const path = `${ROUTES.listNotifications.path}${qs}`;
    return this.send('GET', path, undefined, NotificationPageSchema);
  }

  /** POST /v1/notifications/{id}/read */
  async markNotificationRead(id: string): Promise<void> {
    await this.send('POST', withId(ROUTES.markNotificationRead.path, id), undefined, null);
  }

  /** GET /v1/notifications/preferences */
  getNotificationPreferences(): Promise<NotificationPreferences> {
    const path = ROUTES.getNotificationPreferences.path;
    return this.send('GET', path, undefined, NotificationPreferencesSchema);
  }

  /** PUT /v1/notifications/preferences */
  updateNotificationPreferences(body: NotificationPreferences): Promise<NotificationPreferences> {
    const path = ROUTES.updateNotificationPreferences.path;
    return this.send('PUT', path, body, NotificationPreferencesSchema);
  }

  /** POST /v1/devices — binds the Expo push token to the token's device. */
  registerDevice(body: RegisterDevice): Promise<DeviceRegistration> {
    return this.send('POST', ROUTES.registerDevice.path, body, DeviceRegistrationSchema);
  }

  /** POST /v1/riders/me/locations — HTTP fallback when the socket is down. */
  postRiderLocations(body: RiderLocationBatch): Promise<LocationBatchResult> {
    return this.send('POST', ROUTES.postRiderLocations.path, body, LocationBatchResultSchema);
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
    method: 'GET' | 'POST' | 'PATCH' | 'PUT',
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

/** Parses an RFC 9457 problem body, falling back to a generic problem. */
export async function parseProblem(response: Response): Promise<Problem> {
  try {
    const parsed = ProblemSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : fallbackProblem(response.status);
  } catch {
    return fallbackProblem(response.status);
  }
}
