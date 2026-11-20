import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../openapi.js';
import {
  AddCartLineSchema,
  AdminCancelOrderSchema,
  CheckoutRequestSchema,
  ListAdminOrdersQuerySchema,
  ORDER_FULFILMENT_PORT,
  ORDER_VENDOR_ACCEPTED_EVENT,
  ORDERING_EVENT_TYPES,
  orderEventType,
  OrderVendorAcceptedPayloadSchema,
  UpdateCartLineSchema,
} from './index.js';
import { EventTypeSchema } from '../events.js';

const id = '0b9d1b8e-3c55-4f5e-9d2a-0a6a1c1f0e11';

describe('ordering contracts', () => {
  it('derives one valid event type per order state', () => {
    expect(orderEventType('VENDOR_ACCEPTED')).toBe('ordering.order.vendor_accepted');
    expect(ORDER_VENDOR_ACCEPTED_EVENT).toBe('ordering.order.vendor_accepted');
    expect(ORDERING_EVENT_TYPES).toHaveLength(17);
    for (const t of ORDERING_EVENT_TYPES) expect(EventTypeSchema.safeParse(t).success).toBe(true);
  });

  it('never accepts client prices in cart or checkout bodies', () => {
    const line = { branchId: id, itemId: id, quantity: 1 };
    expect(AddCartLineSchema.parse(line).optionIds).toEqual([]);
    expect(AddCartLineSchema.safeParse({ ...line, unitPriceMinor: 1 }).success).toBe(false);
    const checkout = { cartId: id, addressId: id, paymentMethod: 'wallet' };
    expect(CheckoutRequestSchema.safeParse(checkout).success).toBe(true);
    expect(CheckoutRequestSchema.safeParse({ ...checkout, totalMinor: 1 }).success).toBe(false);
  });

  it('requires something to update and a reason for ops cancels', () => {
    expect(UpdateCartLineSchema.safeParse({}).success).toBe(false);
    expect(UpdateCartLineSchema.safeParse({ quantity: 2 }).success).toBe(true);
    expect(AdminCancelOrderSchema.safeParse({}).success).toBe(false);
    expect(ListAdminOrdersQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });

  it('describes the vendor_accepted payload dispatch consumes', () => {
    const payload = {
      orderId: id,
      orderRef: 'ABC',
      customerId: id,
      vendorId: id,
      branchId: id,
      riderId: null,
      status: 'VENDOR_ACCEPTED',
      previousStatus: 'PLACED',
      actor: { type: 'vendor', id },
      reason: null,
      at: '2026-11-20T10:00:00.000Z',
      pickup: { lat: 6.43, lng: 3.41 },
      dropoff: { lat: 6.43, lng: 3.42 },
      prepMinutes: 15,
      readyAt: '2026-11-20T10:15:00.000Z',
    };
    expect(OrderVendorAcceptedPayloadSchema.safeParse(payload).success).toBe(true);
    expect(ORDER_FULFILMENT_PORT).toBe('ordering.OrderFulfilmentPort');
  });

  it('registers ordering routes in the OpenAPI document', () => {
    const doc = buildOpenApiDocument('test') as { paths: Record<string, Record<string, unknown>> };
    expect(doc.paths['/v1/orders']).toHaveProperty('post');
    expect(doc.paths['/v1/vendor-orders/{id}/accept']).toHaveProperty('post');
    expect(doc.paths['/v1/admin/orders/{id}/cancel']).toHaveProperty('post');
  });
});
