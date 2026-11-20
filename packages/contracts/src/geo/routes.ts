import type { RouteSpec } from '../openapi.js';
import {
  AddressListSchema,
  AddressSchema,
  CreateAddressSchema,
  UpdateAddressSchema,
} from './geo.js';

/** Geo routes (customer addresses). Spread into the OpenAPI route registry. */
export const GEO_ROUTES = {
  listAddresses: {
    method: 'get',
    path: '/v1/addresses',
    operationId: 'listAddresses',
    summary: "List the caller's saved addresses",
    auth: true,
    success: { status: 200, schema: AddressListSchema },
    errors: [401, 403],
  },
  createAddress: {
    method: 'post',
    path: '/v1/addresses',
    operationId: 'createAddress',
    summary: 'Save a delivery address',
    auth: true,
    body: CreateAddressSchema,
    success: { status: 201, schema: AddressSchema },
    errors: [400, 401, 403, 409],
    idempotent: true,
  },
  updateAddress: {
    method: 'patch',
    path: '/v1/addresses/{addressId}',
    operationId: 'updateAddress',
    summary: 'Update a saved address',
    auth: true,
    body: UpdateAddressSchema,
    success: { status: 200, schema: AddressSchema },
    errors: [400, 401, 403, 404, 409],
    idempotent: true,
  },
  deleteAddress: {
    method: 'delete',
    path: '/v1/addresses/{addressId}',
    operationId: 'deleteAddress',
    summary: 'Delete a saved address',
    auth: true,
    success: { status: 204 },
    errors: [400, 401, 403, 404, 409],
    idempotent: true,
  },
} as const satisfies Record<string, RouteSpec>;
