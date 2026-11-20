import { z } from 'zod';
import {
  LogoutRequestSchema,
  OtpRequestResponseSchema,
  OtpRequestSchema,
  OtpVerifySchema,
  RefreshRequestSchema,
  TokenPairSchema,
} from './auth.js';
import { HealthSchema } from './health.js';
import {
  DeviceRegistrationSchema,
  ListNotificationsQuerySchema,
  NotificationPageSchema,
  NotificationPreferencesSchema,
  RegisterDeviceSchema,
} from './notifications/index.js';
import { LocationBatchResultSchema, RiderLocationBatchSchema } from './realtime/index.js';
import { PAYMENT_ROUTES } from './payments/payment-routes.js';
import { PROBLEM_CONTENT_TYPE, ProblemSchema } from './problem.js';
import {
  CreateFeeRuleSchema,
  CreatePromoSchema,
  CreateSurgeRuleSchema,
  FeeRuleListSchema,
  FeeRuleSchema,
  PromoListSchema,
  PromoSchema,
  QuoteRequestSchema,
  QuoteResponseSchema,
  SurgeRuleListSchema,
  SurgeRuleSchema,
  UpdateFeeRuleSchema,
  UpdatePromoSchema,
  UpdateSurgeRuleSchema,
} from './pricing/index.js';

/** One HTTP operation described from Zod schemas. */
export interface RouteSpec {
  readonly method: 'get' | 'post' | 'put' | 'patch';
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly body?: z.ZodType;
  readonly success: { readonly status: number; readonly schema?: z.ZodType };
  readonly errors: readonly number[];
  readonly idempotent?: boolean;
  /** Requires `Authorization: Bearer <access JWT>`. */
  readonly auth?: boolean;
  /** Query-string schema (object of scalars). */
  readonly query?: z.ZodObject;
}

/** Registry of public routes; the API and SDK are both typed against these schemas. */
export const ROUTES = {
  healthz: {
    method: 'get',
    path: '/healthz',
    operationId: 'healthz',
    summary: 'Liveness probe',
    success: { status: 200, schema: HealthSchema },
    errors: [],
  },
  readyz: {
    method: 'get',
    path: '/readyz',
    operationId: 'readyz',
    summary: 'Readiness probe (Postgres + Redis)',
    success: { status: 200, schema: HealthSchema },
    errors: [503],
  },
  requestOtp: {
    method: 'post',
    path: '/v1/auth/otp/request',
    operationId: 'requestOtp',
    summary: 'Send a 6-digit OTP by SMS',
    body: OtpRequestSchema,
    success: { status: 202, schema: OtpRequestResponseSchema },
    errors: [400, 429],
    idempotent: true,
  },
  verifyOtp: {
    method: 'post',
    path: '/v1/auth/otp/verify',
    operationId: 'verifyOtp',
    summary: 'Verify OTP and issue tokens',
    body: OtpVerifySchema,
    success: { status: 200, schema: TokenPairSchema },
    errors: [400, 401, 429],
  },
  refresh: {
    method: 'post',
    path: '/v1/auth/refresh',
    operationId: 'refreshTokens',
    summary: 'Rotate refresh token',
    body: RefreshRequestSchema,
    success: { status: 200, schema: TokenPairSchema },
    errors: [400, 401],
  },
  logout: {
    method: 'post',
    path: '/v1/auth/logout',
    operationId: 'logout',
    summary: 'Revoke the refresh token family',
    body: LogoutRequestSchema,
    success: { status: 204 },
    errors: [400],
  },
  createQuote: {
    method: 'post',
    path: '/v1/quotes',
    operationId: 'createQuote',
    summary: 'Price a cart: itemised fees, surge, promo, VAT and total (server-computed)',
    body: QuoteRequestSchema,
    success: { status: 200, schema: QuoteResponseSchema },
    errors: [400, 401, 422],
    auth: true,
  },
  listFeeRules: {
    method: 'get',
    path: '/v1/admin/fee-rules',
    operationId: 'listFeeRules',
    summary: 'List delivery fee rules (ops, super_admin)',
    success: { status: 200, schema: FeeRuleListSchema },
    errors: [401, 403],
    auth: true,
  },
  createFeeRule: {
    method: 'post',
    path: '/v1/admin/fee-rules',
    operationId: 'createFeeRule',
    summary: 'Create a zone fee rule (ops, super_admin)',
    body: CreateFeeRuleSchema,
    success: { status: 201, schema: FeeRuleSchema },
    errors: [400, 401, 403, 409],
    idempotent: true,
    auth: true,
  },
  updateFeeRule: {
    method: 'patch',
    path: '/v1/admin/fee-rules/{id}',
    operationId: 'updateFeeRule',
    summary: 'Update a zone fee rule (ops, super_admin)',
    body: UpdateFeeRuleSchema,
    success: { status: 200, schema: FeeRuleSchema },
    errors: [400, 401, 403, 404],
    auth: true,
  },
  listSurgeRules: {
    method: 'get',
    path: '/v1/admin/surge-rules',
    operationId: 'listSurgeRules',
    summary: 'List surge rules (ops, super_admin)',
    success: { status: 200, schema: SurgeRuleListSchema },
    errors: [401, 403],
    auth: true,
  },
  createSurgeRule: {
    method: 'post',
    path: '/v1/admin/surge-rules',
    operationId: 'createSurgeRule',
    summary: 'Create a surge rule (ops, super_admin)',
    body: CreateSurgeRuleSchema,
    success: { status: 201, schema: SurgeRuleSchema },
    errors: [400, 401, 403],
    idempotent: true,
    auth: true,
  },
  updateSurgeRule: {
    method: 'patch',
    path: '/v1/admin/surge-rules/{id}',
    operationId: 'updateSurgeRule',
    summary: 'Update a surge rule (ops, super_admin)',
    body: UpdateSurgeRuleSchema,
    success: { status: 200, schema: SurgeRuleSchema },
    errors: [400, 401, 403, 404],
    auth: true,
  },
  listPromos: {
    method: 'get',
    path: '/v1/admin/promos',
    operationId: 'listPromos',
    summary: 'List promos with usage counters (ops, super_admin)',
    success: { status: 200, schema: PromoListSchema },
    errors: [401, 403],
    auth: true,
  },
  createPromo: {
    method: 'post',
    path: '/v1/admin/promos',
    operationId: 'createPromo',
    summary: 'Create a promo code (ops, super_admin)',
    body: CreatePromoSchema,
    success: { status: 201, schema: PromoSchema },
    errors: [400, 401, 403, 409],
    idempotent: true,
    auth: true,
  },
  updatePromo: {
    method: 'patch',
    path: '/v1/admin/promos/{id}',
    operationId: 'updatePromo',
    summary: 'Update a promo code (ops, super_admin)',
    body: UpdatePromoSchema,
    success: { status: 200, schema: PromoSchema },
    errors: [400, 401, 403, 404],
    auth: true,
  },
  listNotifications: {
    method: 'get',
    path: '/v1/notifications',
    operationId: 'listNotifications',
    summary: 'List the in-app notification inbox (newest first, cursor paginated)',
    query: ListNotificationsQuerySchema,
    success: { status: 200, schema: NotificationPageSchema },
    errors: [400, 401],
    auth: true,
  },
  markNotificationRead: {
    method: 'post',
    path: '/v1/notifications/{id}/read',
    operationId: 'markNotificationRead',
    summary: 'Mark one inbox notification as read (naturally idempotent)',
    success: { status: 204 },
    errors: [400, 401, 404],
    auth: true,
  },
  getNotificationPreferences: {
    method: 'get',
    path: '/v1/notifications/preferences',
    operationId: 'getNotificationPreferences',
    summary: 'Effective notification preferences per category and channel',
    success: { status: 200, schema: NotificationPreferencesSchema },
    errors: [401],
    auth: true,
  },
  updateNotificationPreferences: {
    method: 'put',
    path: '/v1/notifications/preferences',
    operationId: 'updateNotificationPreferences',
    summary: 'Upsert notification preferences (full or partial list; naturally idempotent)',
    body: NotificationPreferencesSchema,
    success: { status: 200, schema: NotificationPreferencesSchema },
    errors: [400, 401],
    auth: true,
  },
  registerDevice: {
    method: 'post',
    path: '/v1/devices',
    operationId: 'registerDevice',
    summary: 'Register the Expo push token of the device bound to the access token (upsert)',
    body: RegisterDeviceSchema,
    success: { status: 200, schema: DeviceRegistrationSchema },
    errors: [400, 401],
    auth: true,
  },
  postRiderLocations: {
    method: 'post',
    path: '/v1/riders/me/locations',
    operationId: 'postRiderLocations',
    summary: 'HTTP fallback for rider location updates (batched points)',
    body: RiderLocationBatchSchema,
    success: { status: 202, schema: LocationBatchResultSchema },
    errors: [400, 401, 403, 429],
    auth: true,
  },
  ...PAYMENT_ROUTES,
} as const satisfies Record<string, RouteSpec>;

const json = (schema: z.ZodType): object => z.toJSONSchema(schema, { target: 'draft-2020-12' });

function problemResponses(statuses: readonly number[]): Record<string, object> {
  const problem = {
    content: { [PROBLEM_CONTENT_TYPE]: { schema: { $ref: '#/components/schemas/Problem' } } },
  };
  return Object.fromEntries(
    statuses.map((s) => [String(s), { description: 'Problem', ...problem }]),
  );
}

/** Declares `{name}` path segments as required UUID path parameters. */
function pathParameters(path: string): object[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  }));
}

function queryParameters(query: z.ZodObject | undefined): object[] {
  if (!query) return [];
  const shape: Record<string, z.ZodType> = query.shape;
  return Object.entries(shape).map(([name, schema]) => ({
    name,
    in: 'query',
    required: !schema.safeParse(undefined).success,
    schema: z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' }),
  }));
}

function operation(route: RouteSpec): object {
  const ok = route.success.schema
    ? {
        description: 'Success',
        content: { 'application/json': { schema: json(route.success.schema) } },
      }
    : { description: 'No content' };
  const headers = route.idempotent
    ? [
        {
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          schema: { type: 'string', minLength: 8, maxLength: 128 },
        },
      ]
    : [];
  const parameters = [...pathParameters(route.path), ...headers, ...queryParameters(route.query)];
  return {
    operationId: route.operationId,
    summary: route.summary,
    ...(route.auth ? { security: [{ bearerAuth: [] }] } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: json(route.body) } },
          },
        }
      : {}),
    responses: { [String(route.success.status)]: ok, ...problemResponses([...route.errors, 500]) },
  };
}

/** Builds the OpenAPI 3.1 document for all registered routes. */
export function buildOpenApiDocument(version: string): Record<string, unknown> {
  const paths: Record<string, Record<string, object>> = {};
  for (const route of Object.values(ROUTES) as RouteSpec[]) {
    paths[route.path] = { ...paths[route.path], [route.method]: operation(route) };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Delyva API', version },
    jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    paths,
    components: {
      schemas: { Problem: json(ProblemSchema) },
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
  };
}
