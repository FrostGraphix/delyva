import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from './openapi.js';

interface Op {
  parameters?: { name: string }[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
}

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument('0.0.0') as {
    openapi: string;
    paths: Record<string, Record<string, Op>>;
  };

  it('emits an OpenAPI 3.1 document with every auth route', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        '/v1/auth/otp/request',
        '/v1/auth/otp/verify',
        '/v1/auth/refresh',
        '/v1/auth/logout',
      ]),
    );
  });

  it('requires an Idempotency-Key on OTP request', () => {
    const op = doc.paths['/v1/auth/otp/request']?.post;
    expect(op?.parameters?.[0]?.name).toBe('Idempotency-Key');
    expect(op?.responses['429']).toBeDefined();
  });

  it('declares pricing routes with bearer auth and uuid path params', () => {
    const quote = doc.paths['/v1/quotes']?.post as Op & { security?: unknown[] };
    expect(quote.security).toEqual([{ bearerAuth: [] }]);
    const patch = doc.paths['/v1/admin/promos/{id}']?.patch;
    expect(patch?.parameters?.[0]?.name).toBe('id');
    expect(doc.paths['/v1/admin/fee-rules']?.post?.parameters?.[0]?.name).toBe('Idempotency-Key');
  });

  it('describes body-less and no-content operations', () => {
    expect(doc.paths['/healthz']?.get?.requestBody).toBeUndefined();
    expect(doc.paths['/v1/auth/logout']?.post?.responses['204']).toEqual({
      description: 'No content',
    });
  });
});
