import { z } from 'zod';

/** Latitude in decimal degrees (WGS84). */
export const LatitudeSchema = z.number().min(-90).max(90);
/** Longitude in decimal degrees (WGS84). */
export const LongitudeSchema = z.number().min(-180).max(180);

/** A WGS84 coordinate. */
export const GeoPointSchema = z.strictObject({ lat: LatitudeSchema, lng: LongitudeSchema });
/** A WGS84 coordinate. */
export type GeoPoint = z.infer<typeof GeoPointSchema>;

/** Saved customer address. `line1` and `landmark` are PII: never logged. */
export const AddressSchema = z.strictObject({
  id: z.uuid(),
  label: z.string(),
  line1: z.string(),
  landmark: z.string().nullable(),
  lat: LatitudeSchema,
  lng: LongitudeSchema,
  createdAt: z.iso.datetime(),
});
/** Saved customer address. */
export type Address = z.infer<typeof AddressSchema>;

/** GET /v1/addresses response. */
export const AddressListSchema = z.strictObject({ items: z.array(AddressSchema) });
/** GET /v1/addresses response. */
export type AddressList = z.infer<typeof AddressListSchema>;

const label = z.string().trim().min(1).max(40);
const line1 = z.string().trim().min(3).max(200);
const landmark = z.string().trim().min(1).max(200);

/** POST /v1/addresses body. */
export const CreateAddressSchema = z.strictObject({
  label,
  line1,
  landmark: landmark.optional(),
  lat: LatitudeSchema,
  lng: LongitudeSchema,
});
/** POST /v1/addresses body. */
export type CreateAddress = z.infer<typeof CreateAddressSchema>;

/** PATCH /v1/addresses/{addressId} body (at least one field). */
export const UpdateAddressSchema = z
  .strictObject({
    label: label.optional(),
    line1: line1.optional(),
    landmark: landmark.nullable().optional(),
    lat: LatitudeSchema.optional(),
    lng: LongitudeSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'At least one field is required')
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), 'lat and lng change together');
/** PATCH /v1/addresses/{addressId} body. */
export type UpdateAddress = z.infer<typeof UpdateAddressSchema>;
