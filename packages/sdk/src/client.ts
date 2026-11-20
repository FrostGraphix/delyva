import {
  type Address,
  type AddressList,
  AddressListSchema,
  AddressSchema,
  type CreateAddress,
  type CreateMenuItem,
  type CreateModifierGroup,
  type DiscoverVendorsQuery,
  type DiscoverVendorsResponse,
  DiscoverVendorsResponseSchema,
  type MenuItem,
  MenuItemSchema,
  type ModifierGroup,
  ModifierGroupSchema,
  type ModifierOption,
  ModifierOptionSchema,
  type OpeningHoursResponse,
  OpeningHoursResponseSchema,
  type ReplaceOpeningHours,
  type SetAvailability,
  type UpdateAddress,
  type UpdateMenuItem,
  type VendorDetail,
  VendorDetailSchema,
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
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

  /** GET /v1/vendors — open vendors that deliver to the point. */
  discoverVendors(query: DiscoverVendorsQuery): Promise<DiscoverVendorsResponse> {
    const qs = new URLSearchParams({ lat: String(query.lat), lng: String(query.lng) });
    if (query.category) qs.set('category', query.category);
    const path = `${ROUTES.discoverVendors.path}?${qs.toString()}`;
    return this.send('GET', path, undefined, DiscoverVendorsResponseSchema);
  }

  /** GET /v1/vendors/{vendorId} */
  getVendor(vendorId: string): Promise<VendorDetail> {
    const path = pathOf(ROUTES.getVendor.path, { vendorId });
    return this.send('GET', path, undefined, VendorDetailSchema);
  }

  /** GET /v1/addresses (auth) */
  listAddresses(): Promise<AddressList> {
    return this.send('GET', ROUTES.listAddresses.path, undefined, AddressListSchema);
  }

  /** POST /v1/addresses (auth, idempotent) */
  createAddress(body: CreateAddress, idempotencyKey?: string): Promise<Address> {
    return this.send(
      'POST',
      ROUTES.createAddress.path,
      body,
      AddressSchema,
      this.idem(idempotencyKey),
    );
  }

  /** PATCH /v1/addresses/{addressId} (auth, idempotent) */
  updateAddress(addressId: string, body: UpdateAddress, idempotencyKey?: string): Promise<Address> {
    const path = pathOf(ROUTES.updateAddress.path, { addressId });
    return this.send('PATCH', path, body, AddressSchema, this.idem(idempotencyKey));
  }

  /** DELETE /v1/addresses/{addressId} (auth, idempotent) */
  async deleteAddress(addressId: string, idempotencyKey?: string): Promise<void> {
    const path = pathOf(ROUTES.deleteAddress.path, { addressId });
    await this.send('DELETE', path, undefined, null, this.idem(idempotencyKey));
  }

  /** POST /v1/vendors/{vendorId}/items (vendor owner) */
  createMenuItem(
    vendorId: string,
    body: CreateMenuItem,
    idempotencyKey?: string,
  ): Promise<MenuItem> {
    const path = pathOf(ROUTES.createMenuItem.path, { vendorId });
    return this.send('POST', path, body, MenuItemSchema, this.idem(idempotencyKey));
  }

  /** PATCH /v1/vendors/{vendorId}/items/{itemId} (vendor owner) */
  updateMenuItem(
    vendorId: string,
    itemId: string,
    body: UpdateMenuItem,
    idempotencyKey?: string,
  ): Promise<MenuItem> {
    const path = pathOf(ROUTES.updateMenuItem.path, { vendorId, itemId });
    return this.send('PATCH', path, body, MenuItemSchema, this.idem(idempotencyKey));
  }

  /** PUT …/items/{itemId}/availability (vendor owner or staff) */
  setItemAvailability(
    vendorId: string,
    itemId: string,
    body: SetAvailability,
    idempotencyKey?: string,
  ): Promise<MenuItem> {
    const path = pathOf(ROUTES.setItemAvailability.path, { vendorId, itemId });
    return this.send('PUT', path, body, MenuItemSchema, this.idem(idempotencyKey));
  }

  /** PUT …/modifier-options/{optionId}/availability (vendor owner or staff) */
  setModifierOptionAvailability(
    vendorId: string,
    optionId: string,
    body: SetAvailability,
    idempotencyKey?: string,
  ): Promise<ModifierOption> {
    const path = pathOf(ROUTES.setModifierOptionAvailability.path, { vendorId, optionId });
    return this.send('PUT', path, body, ModifierOptionSchema, this.idem(idempotencyKey));
  }

  /** POST …/items/{itemId}/modifier-groups (vendor owner) */
  createModifierGroup(
    vendorId: string,
    itemId: string,
    body: CreateModifierGroup,
    idempotencyKey?: string,
  ): Promise<ModifierGroup> {
    const path = pathOf(ROUTES.createModifierGroup.path, { vendorId, itemId });
    return this.send('POST', path, body, ModifierGroupSchema, this.idem(idempotencyKey));
  }

  /** PUT …/branches/{branchId}/opening-hours (vendor owner) */
  replaceOpeningHours(
    vendorId: string,
    branchId: string,
    body: ReplaceOpeningHours,
    idempotencyKey?: string,
  ): Promise<OpeningHoursResponse> {
    const path = pathOf(ROUTES.replaceOpeningHours.path, { vendorId, branchId });
    return this.send('PUT', path, body, OpeningHoursResponseSchema, this.idem(idempotencyKey));
  }

  /** POST /v1/vendors/{vendorId}/go-live (ops) */
  approveVendor(vendorId: string, idempotencyKey?: string): Promise<VendorDetail> {
    const path = pathOf(ROUTES.approveVendor.path, { vendorId });
    return this.send('POST', path, undefined, VendorDetailSchema, this.idem(idempotencyKey));
  }
}

/** Fills `{name}` path segments, URL-encoding each value. */
export function pathOf(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`missing path param ${name}`);
    return encodeURIComponent(value);
  });
}

async function parseProblem(response: Response): Promise<Problem> {
  try {
    const parsed = ProblemSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : fallbackProblem(response.status);
  } catch {
    return fallbackProblem(response.status);
  }
}
