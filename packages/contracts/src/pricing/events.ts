import { z } from 'zod';
import { AmountMinorSchema } from './common.js';

/** Event type emitted when a promo redemption is recorded. */
export const PROMO_REDEEMED_EVENT = 'pricing.promo.redeemed';

/** Payload of `pricing.promo.redeemed` (no PII: ids only). */
export const PromoRedeemedPayloadSchema = z.object({
  redemptionId: z.uuid(),
  promoId: z.uuid(),
  code: z.string(),
  userId: z.uuid(),
  orderId: z.uuid(),
  discountMinor: AmountMinorSchema,
});
/** Payload of `pricing.promo.redeemed`. */
export type PromoRedeemedPayload = z.infer<typeof PromoRedeemedPayloadSchema>;
