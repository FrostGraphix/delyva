import { z } from 'zod';
import type { RouteSpec } from '../openapi.js';
import {
  CreateMenuItemSchema,
  CreateModifierGroupSchema,
  DiscoverVendorsQuerySchema,
  DiscoverVendorsResponseSchema,
  MenuItemSchema,
  ModifierGroupSchema,
  ModifierOptionSchema,
  OpeningHoursEntrySchema,
  ReplaceOpeningHoursSchema,
  SetAvailabilitySchema,
  UpdateMenuItemSchema,
  VendorDetailSchema,
} from './catalog.js';

const writeErrors = [400, 401, 403, 404, 409] as const;

/** PUT …/opening-hours response. */
export const OpeningHoursResponseSchema = z.strictObject({
  hours: z.array(OpeningHoursEntrySchema),
});
/** PUT …/opening-hours response. */
export type OpeningHoursResponse = z.infer<typeof OpeningHoursResponseSchema>;

/** Catalog routes (discovery + vendor menu management). Spread into the OpenAPI route registry. */
export const CATALOG_ROUTES = {
  discoverVendors: {
    method: 'get',
    path: '/v1/vendors',
    operationId: 'discoverVendors',
    summary: 'Open vendors whose delivery zone contains the point, fastest first',
    query: DiscoverVendorsQuerySchema,
    success: { status: 200, schema: DiscoverVendorsResponseSchema },
    errors: [400],
  },
  getVendor: {
    method: 'get',
    path: '/v1/vendors/{vendorId}',
    operationId: 'getVendor',
    summary: 'A live vendor with branches, hours and full menu',
    success: { status: 200, schema: VendorDetailSchema },
    errors: [400, 404],
  },
  createMenuItem: {
    method: 'post',
    path: '/v1/vendors/{vendorId}/items',
    operationId: 'createMenuItem',
    summary: 'Add a menu item (vendor owner)',
    auth: true,
    body: CreateMenuItemSchema,
    success: { status: 201, schema: MenuItemSchema },
    errors: writeErrors,
    idempotent: true,
  },
  updateMenuItem: {
    method: 'patch',
    path: '/v1/vendors/{vendorId}/items/{itemId}',
    operationId: 'updateMenuItem',
    summary: 'Edit a menu item (vendor owner)',
    auth: true,
    body: UpdateMenuItemSchema,
    success: { status: 200, schema: MenuItemSchema },
    errors: writeErrors,
    idempotent: true,
  },
  setItemAvailability: {
    method: 'put',
    path: '/v1/vendors/{vendorId}/items/{itemId}/availability',
    operationId: 'setItemAvailability',
    summary: 'Mark an item available or sold out (vendor owner or staff)',
    auth: true,
    body: SetAvailabilitySchema,
    success: { status: 200, schema: MenuItemSchema },
    errors: writeErrors,
    idempotent: true,
  },
  setModifierOptionAvailability: {
    method: 'put',
    path: '/v1/vendors/{vendorId}/modifier-options/{optionId}/availability',
    operationId: 'setModifierOptionAvailability',
    summary: 'Mark a modifier option available or sold out (vendor owner or staff)',
    auth: true,
    body: SetAvailabilitySchema,
    success: { status: 200, schema: ModifierOptionSchema },
    errors: writeErrors,
    idempotent: true,
  },
  createModifierGroup: {
    method: 'post',
    path: '/v1/vendors/{vendorId}/items/{itemId}/modifier-groups',
    operationId: 'createModifierGroup',
    summary: 'Attach a modifier group with options to an item (vendor owner)',
    auth: true,
    body: CreateModifierGroupSchema,
    success: { status: 201, schema: ModifierGroupSchema },
    errors: writeErrors,
    idempotent: true,
  },
  replaceOpeningHours: {
    method: 'put',
    path: '/v1/vendors/{vendorId}/branches/{branchId}/opening-hours',
    operationId: 'replaceOpeningHours',
    summary: "Replace a branch's weekly opening hours (vendor owner)",
    auth: true,
    body: ReplaceOpeningHoursSchema,
    success: { status: 200, schema: OpeningHoursResponseSchema },
    errors: writeErrors,
    idempotent: true,
  },
  approveVendor: {
    method: 'post',
    path: '/v1/vendors/{vendorId}/go-live',
    operationId: 'approveVendor',
    summary: 'Approve an in-review vendor and make it live (ops, super_admin)',
    auth: true,
    success: { status: 200, schema: VendorDetailSchema },
    errors: writeErrors,
    idempotent: true,
  },
} as const satisfies Record<string, RouteSpec>;
