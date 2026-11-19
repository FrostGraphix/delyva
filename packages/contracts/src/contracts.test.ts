import { describe, expect, it } from 'vitest';
import {
  EventEnvelopeSchema,
  NigeriaPhoneSchema,
  ORDER_HAPPY_PATH,
  OrderStatus,
  OtpRequestSchema,
  OtpVerifySchema,
  ProblemSchema,
} from './index.js';

describe('NigeriaPhoneSchema', () => {
  it.each(['+2348031234567', '+2347012345678', '+2349101234567'])('accepts %s', (phone) => {
    expect(NigeriaPhoneSchema.safeParse(phone).success).toBe(true);
  });

  it.each(['08031234567', '+234803123456', '+2346031234567', '+15551234567', '+23480312345678'])(
    'rejects %s',
    (phone) => {
      expect(NigeriaPhoneSchema.safeParse(phone).success).toBe(false);
    },
  );
});

describe('OTP DTOs', () => {
  it('rejects unknown fields', () => {
    expect(OtpRequestSchema.safeParse({ phone: '+2348031234567', role: 'admin' }).success).toBe(
      false,
    );
  });

  it('requires a 6-digit code', () => {
    const base = { phone: '+2348031234567', deviceId: 'device-12345' };
    expect(OtpVerifySchema.safeParse({ ...base, code: '123456' }).success).toBe(true);
    expect(OtpVerifySchema.safeParse({ ...base, code: '12345' }).success).toBe(false);
    expect(OtpVerifySchema.safeParse({ ...base, code: '12345a' }).success).toBe(false);
  });
});

describe('OrderStatus', () => {
  it('exposes the happy path from PENDING_PAYMENT to DELIVERED', () => {
    expect(ORDER_HAPPY_PATH[0]).toBe(OrderStatus.PENDING_PAYMENT);
    expect(ORDER_HAPPY_PATH.at(-1)).toBe(OrderStatus.DELIVERED);
  });
});

describe('ProblemSchema', () => {
  it('accepts an RFC 9457 body with a stable code', () => {
    const body = {
      type: 'about:blank',
      title: 'Too Many Requests',
      status: 429,
      code: 'rate_limited',
    };
    expect(ProblemSchema.safeParse(body).success).toBe(true);
    expect(ProblemSchema.safeParse({ ...body, code: 'nope' }).success).toBe(false);
  });
});

describe('EventEnvelopeSchema', () => {
  it('enforces context.entity.past_tense names', () => {
    const env = {
      id: '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11',
      type: 'identity.user.registered',
      version: 1,
      occurredAt: '2026-01-01T00:00:00Z',
      aggregateType: 'user',
      aggregateId: 'abc',
      payload: {},
    };
    expect(EventEnvelopeSchema.safeParse(env).success).toBe(true);
    expect(EventEnvelopeSchema.safeParse({ ...env, type: 'UserRegistered' }).success).toBe(false);
  });
});
