import { z } from 'zod';
import {
  LogoutRequestSchema,
  OtpRequestResponseSchema,
  OtpRequestSchema,
  OtpVerifySchema,
  RefreshRequestSchema,
  TokenPairSchema,
} from './auth.js';
import { CATALOG_ROUTES } from './catalog/routes.js';
import { GEO_ROUTES } from './geo/routes.js';
import { HealthSchema } from './health.js';
import { PROBLEM_CONTENT_TYPE, ProblemSchema } from './problem.js';

/** One HTTP operation described from Zod schemas. Path params are taken from `{name}` segments. */
export interface RouteSpec {
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly body?: z.ZodType;
  /** Query-string schema (object). */
  readonly query?: z.ZodObject;
  /** Requires a Bearer access token. */
  readonly auth?: boolean;
  readonly success: { readonly status: number; readonly schema?: z.ZodType };
  readonly errors: readonly number[];
  readonly idempotent?: boolean;
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
  ...GEO_ROUTES,
  ...CATALOG_ROUTES,
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

function pathParameters(path: string): object[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
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
    schema: z.toJSONSchema(schema, {
      target: 'draft-2020-12',
      io: 'input',
      unrepresentable: 'any',
    }),
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
  const parameters = [...pathParameters(route.path), ...queryParameters(route.query), ...headers];
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
