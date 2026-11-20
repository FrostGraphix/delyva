import { z } from 'zod';
import { LatitudeSchema, LongitudeSchema } from '../geo/geo.js';

/** Vendor categories. */
export const VendorCategorySchema = z.enum(['restaurant', 'grocery', 'pharmacy', 'bakery', 'shop']);
/** Vendor category. */
export type VendorCategory = z.infer<typeof VendorCategorySchema>;

/** Vendor lifecycle status. Only `live` vendors are discoverable. */
export const VendorStatusSchema = z.enum(['draft', 'in_review', 'live', 'suspended']);
/** Vendor lifecycle status. */
export type VendorStatus = z.infer<typeof VendorStatusSchema>;

/** Largest catalog price accepted (₦10,000,000 in kobo); guards against fat-finger input. */
export const MAX_CATALOG_PRICE_MINOR = 1_000_000_000;

/** A catalog price in integer minor units (kobo). Never a float. */
export const CatalogPriceSchema = z.strictObject({
  amountMinor: z.number().int().min(0).max(MAX_CATALOG_PRICE_MINOR),
  currency: z.literal('NGN'),
});
/** A catalog price in integer minor units. */
export type CatalogPrice = z.infer<typeof CatalogPriceSchema>;

/** Wall-clock time `HH:MM` in Africa/Lagos; `24:00` is allowed only as a closing time. */
export const TimeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');

/** One weekly opening interval. `closesAt <= opensAt` means it runs past midnight. */
export const OpeningHoursEntrySchema = z
  .strictObject({
    dayOfWeek: z.number().int().min(0).max(6).describe('0 = Sunday … 6 = Saturday (Lagos time)'),
    opensAt: TimeOfDaySchema,
    closesAt: z.union([TimeOfDaySchema, z.literal('24:00')]),
  })
  .refine((e) => e.opensAt !== e.closesAt, 'opensAt and closesAt must differ');
/** One weekly opening interval. */
export type OpeningHoursEntry = z.infer<typeof OpeningHoursEntrySchema>;

/** GET /v1/vendors query. */
export const DiscoverVendorsQuerySchema = z.strictObject({
  lat: z.coerce.number().pipe(LatitudeSchema),
  lng: z.coerce.number().pipe(LongitudeSchema),
  category: VendorCategorySchema.optional(),
});
/** GET /v1/vendors query. */
export type DiscoverVendorsQuery = z.infer<typeof DiscoverVendorsQuerySchema>;

/** A discoverable vendor as seen from the customer's point. */
export const VendorSummarySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  category: VendorCategorySchema,
  branchId: z.uuid(),
  zoneId: z.uuid(),
  distanceMeters: z.number().int().nonnegative(),
  etaMinutes: z.number().int().positive(),
  deliveryFee: CatalogPriceSchema.nullable().describe('null until the pricing context quotes it'),
});
/** A discoverable vendor. */
export type VendorSummary = z.infer<typeof VendorSummarySchema>;

/** GET /v1/vendors response. */
export const DiscoverVendorsResponseSchema = z.strictObject({
  items: z.array(VendorSummarySchema),
});
/** GET /v1/vendors response. */
export type DiscoverVendorsResponse = z.infer<typeof DiscoverVendorsResponseSchema>;

/** Modifier option (e.g. "Extra beef"). */
export const ModifierOptionSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  priceDelta: CatalogPriceSchema,
  available: z.boolean(),
});
/** Modifier option. */
export type ModifierOption = z.infer<typeof ModifierOptionSchema>;

/** Modifier group with selection bounds. */
export const ModifierGroupSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  minSelect: z.number().int().nonnegative(),
  maxSelect: z.number().int().positive(),
  options: z.array(ModifierOptionSchema),
});
/** Modifier group. */
export type ModifierGroup = z.infer<typeof ModifierGroupSchema>;

/** Menu item. */
export const MenuItemSchema = z.strictObject({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  price: CatalogPriceSchema,
  available: z.boolean(),
  modifierGroups: z.array(ModifierGroupSchema),
});
/** Menu item. */
export type MenuItem = z.infer<typeof MenuItemSchema>;

/** Menu category with its items. */
export const MenuCategorySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  position: z.number().int(),
  items: z.array(MenuItemSchema),
});
/** Menu category. */
export type MenuCategory = z.infer<typeof MenuCategorySchema>;

/** Branch with location and hours. */
export const BranchSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  lat: LatitudeSchema,
  lng: LongitudeSchema,
  zoneId: z.uuid(),
  openingHours: z.array(OpeningHoursEntrySchema),
  isOpenNow: z.boolean(),
});
/** Branch. */
export type Branch = z.infer<typeof BranchSchema>;

/** GET /v1/vendors/{vendorId} response. */
export const VendorDetailSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  category: VendorCategorySchema,
  status: VendorStatusSchema,
  description: z.string().nullable(),
  branches: z.array(BranchSchema),
  menu: z.strictObject({ categories: z.array(MenuCategorySchema) }),
});
/** GET /v1/vendors/{vendorId} response. */
export type VendorDetail = z.infer<typeof VendorDetailSchema>;

const name = z.string().trim().min(1).max(120);
const description = z.string().trim().max(500);

/** POST /v1/vendors/{vendorId}/items body. */
export const CreateMenuItemSchema = z.strictObject({
  categoryId: z.uuid(),
  name,
  description: description.optional(),
  price: CatalogPriceSchema,
  available: z.boolean().optional(),
});
/** POST /v1/vendors/{vendorId}/items body. */
export type CreateMenuItem = z.infer<typeof CreateMenuItemSchema>;

/** PATCH /v1/vendors/{vendorId}/items/{itemId} body (at least one field). */
export const UpdateMenuItemSchema = z
  .strictObject({
    categoryId: z.uuid().optional(),
    name: name.optional(),
    description: description.nullable().optional(),
    price: CatalogPriceSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required');
/** PATCH /v1/vendors/{vendorId}/items/{itemId} body. */
export type UpdateMenuItem = z.infer<typeof UpdateMenuItemSchema>;

/** PUT …/availability body. */
export const SetAvailabilitySchema = z.strictObject({ available: z.boolean() });
/** PUT …/availability body. */
export type SetAvailability = z.infer<typeof SetAvailabilitySchema>;

/** Maximum options per modifier group. */
export const MAX_MODIFIER_OPTIONS = 30;

/** POST /v1/vendors/{vendorId}/items/{itemId}/modifier-groups body. */
export const CreateModifierGroupSchema = z
  .strictObject({
    name,
    minSelect: z.number().int().min(0),
    maxSelect: z.number().int().min(1),
    options: z
      .array(z.strictObject({ name, priceDelta: CatalogPriceSchema }))
      .min(1)
      .max(MAX_MODIFIER_OPTIONS),
  })
  .refine((g) => g.minSelect <= g.maxSelect, 'minSelect must be <= maxSelect')
  .refine((g) => g.maxSelect <= g.options.length, 'maxSelect must be <= number of options');
/** POST …/modifier-groups body. */
export type CreateModifierGroup = z.infer<typeof CreateModifierGroupSchema>;

/** PUT /v1/vendors/{vendorId}/branches/{branchId}/opening-hours body (replaces the week). */
export const ReplaceOpeningHoursSchema = z.strictObject({
  hours: z.array(OpeningHoursEntrySchema).max(21),
});
/** PUT …/opening-hours body. */
export type ReplaceOpeningHours = z.infer<typeof ReplaceOpeningHoursSchema>;

/** Payload of `catalog.vendor.went_live`. */
export const VendorWentLivePayloadSchema = z.object({ vendorId: z.uuid() });
/** Payload of `catalog.vendor.went_live`. */
export type VendorWentLivePayload = z.infer<typeof VendorWentLivePayloadSchema>;

/** Payload of `catalog.item.availability_changed` (item or modifier option). */
export const ItemAvailabilityChangedPayloadSchema = z.object({
  vendorId: z.uuid(),
  itemId: z.uuid(),
  optionId: z.uuid().nullable(),
  available: z.boolean(),
});
/** Payload of `catalog.item.availability_changed`. */
export type ItemAvailabilityChangedPayload = z.infer<typeof ItemAvailabilityChangedPayloadSchema>;
