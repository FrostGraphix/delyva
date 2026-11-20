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
} from '@delyva/contracts';
import type { z } from 'zod';

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
  /** Supplies the current access token for authenticated calls (from SecureStore/Keychain). */
  readonly getAccessToken?: () => string | null | Promise<string | null>;
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

  private post<S extends z.ZodType>(
    path: string,
    body: unknown,
    schema: S | null,
    headers: Record<string, string> = {},
  ): Promise<z.infer<S>> {
    return this.send('POST', path, schema, { body, headers });
  }

  /** Shared request path for all endpoints (timeouts, problem parsing, auth, idempotency). */
  private async send<S extends z.ZodType>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    schema: S | null,
    init: {
      body?: unknown;
      headers?: Record<string, string>;
      auth?: boolean;
      idempotent?: string | true;
    } = {},
  ): Promise<z.infer<S>> {
    const headers: Record<string, string> = {
      accept: `application/json, ${PROBLEM_CONTENT_TYPE}`,
      ...init.headers,
    };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (init.auth) {
      const token = await this.options.getAccessToken?.();
      if (token) headers.authorization = `Bearer ${token}`;
    }
    if (init.idempotent !== undefined) headers['Idempotency-Key'] = this.keyFor(init.idempotent);
    const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
      method,
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
    });
    if (!response.ok) throw new ApiError(await parseProblem(response));
    if (schema === null) return undefined as z.infer<S>;
    return schema.parse(await response.json());
  }

  private keyFor(key: string | true): string {
    if (key !== true) return key;
    return this.options.idempotencyKey?.() ?? crypto.randomUUID();
  }

  /** GET /v1/vendors — open vendors that deliver to the point. */
  discoverVendors(query: DiscoverVendorsQuery): Promise<DiscoverVendorsResponse> {
    const qs = new URLSearchParams({ lat: String(query.lat), lng: String(query.lng) });
    if (query.category) qs.set('category', query.category);
    return this.send(
      'GET',
      `${ROUTES.discoverVendors.path}?${qs.toString()}`,
      DiscoverVendorsResponseSchema,
    );
  }

  /** GET /v1/vendors/{vendorId} */
  getVendor(vendorId: string): Promise<VendorDetail> {
    return this.send('GET', pathOf(ROUTES.getVendor.path, { vendorId }), VendorDetailSchema);
  }

  /** GET /v1/addresses (auth) */
  listAddresses(): Promise<AddressList> {
    return this.send('GET', ROUTES.listAddresses.path, AddressListSchema, { auth: true });
  }

  /** POST /v1/addresses (auth, idempotent) */
  createAddress(body: CreateAddress, idempotencyKey?: string): Promise<Address> {
    return this.send('POST', ROUTES.createAddress.path, AddressSchema, write(body, idempotencyKey));
  }

  /** PATCH /v1/addresses/{addressId} (auth, idempotent) */
  updateAddress(addressId: string, body: UpdateAddress, idempotencyKey?: string): Promise<Address> {
    const path = pathOf(ROUTES.updateAddress.path, { addressId });
    return this.send('PATCH', path, AddressSchema, write(body, idempotencyKey));
  }

  /** DELETE /v1/addresses/{addressId} (auth, idempotent) */
  async deleteAddress(addressId: string, idempotencyKey?: string): Promise<void> {
    const path = pathOf(ROUTES.deleteAddress.path, { addressId });
    await this.send('DELETE', path, null, write(undefined, idempotencyKey));
  }

  /** POST /v1/vendors/{vendorId}/items (vendor owner) */
  createMenuItem(
    vendorId: string,
    body: CreateMenuItem,
    idempotencyKey?: string,
  ): Promise<MenuItem> {
    const path = pathOf(ROUTES.createMenuItem.path, { vendorId });
    return this.send('POST', path, MenuItemSchema, write(body, idempotencyKey));
  }

  /** PATCH /v1/vendors/{vendorId}/items/{itemId} (vendor owner) */
  updateMenuItem(
    vendorId: string,
    itemId: string,
    body: UpdateMenuItem,
    idempotencyKey?: string,
  ): Promise<MenuItem> {
    const path = pathOf(ROUTES.updateMenuItem.path, { vendorId, itemId });
    return this.send('PATCH', path, MenuItemSchema, write(body, idempotencyKey));
  }

  /** PUT …/items/{itemId}/availability (vendor owner or staff) */
  setItemAvailability(
    vendorId: string,
    itemId: string,
    body: SetAvailability,
    idempotencyKey?: string,
  ): Promise<MenuItem> {
    const path = pathOf(ROUTES.setItemAvailability.path, { vendorId, itemId });
    return this.send('PUT', path, MenuItemSchema, write(body, idempotencyKey));
  }

  /** PUT …/modifier-options/{optionId}/availability (vendor owner or staff) */
  setModifierOptionAvailability(
    vendorId: string,
    optionId: string,
    body: SetAvailability,
    idempotencyKey?: string,
  ): Promise<ModifierOption> {
    const path = pathOf(ROUTES.setModifierOptionAvailability.path, { vendorId, optionId });
    return this.send('PUT', path, ModifierOptionSchema, write(body, idempotencyKey));
  }

  /** POST …/items/{itemId}/modifier-groups (vendor owner) */
  createModifierGroup(
    vendorId: string,
    itemId: string,
    body: CreateModifierGroup,
    idempotencyKey?: string,
  ): Promise<ModifierGroup> {
    const path = pathOf(ROUTES.createModifierGroup.path, { vendorId, itemId });
    return this.send('POST', path, ModifierGroupSchema, write(body, idempotencyKey));
  }

  /** PUT …/branches/{branchId}/opening-hours (vendor owner) */
  replaceOpeningHours(
    vendorId: string,
    branchId: string,
    body: ReplaceOpeningHours,
    idempotencyKey?: string,
  ): Promise<OpeningHoursResponse> {
    const path = pathOf(ROUTES.replaceOpeningHours.path, { vendorId, branchId });
    return this.send('PUT', path, OpeningHoursResponseSchema, write(body, idempotencyKey));
  }

  /** POST /v1/vendors/{vendorId}/go-live (ops) */
  approveVendor(vendorId: string, idempotencyKey?: string): Promise<VendorDetail> {
    const path = pathOf(ROUTES.approveVendor.path, { vendorId });
    return this.send('POST', path, VendorDetailSchema, write(undefined, idempotencyKey));
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

const write = (body: unknown, idempotencyKey?: string) => ({
  body,
  auth: true,
  idempotent: idempotencyKey ?? (true as const),
});

async function parseProblem(response: Response): Promise<Problem> {
  try {
    const parsed = ProblemSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : fallbackProblem(response.status);
  } catch {
    return fallbackProblem(response.status);
  }
}
