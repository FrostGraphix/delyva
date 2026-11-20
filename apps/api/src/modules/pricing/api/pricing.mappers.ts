import type { FeeRule, Promo, QuoteResponse, SurgeRule } from '@delyva/contracts';
import type { StoredFeeRule, StoredPromo, StoredSurgeRule } from '../application/ports.js';
import type { QuoteResult } from '../application/pricing.service.js';

/** Domain quote → wire DTO (integer kobo everywhere). */
export function toQuoteResponse({ quote, promo, computedAt }: QuoteResult): QuoteResponse {
  return {
    currency: 'NGN',
    zoneCode: quote.zoneCode,
    distanceMeters: quote.distanceMeters,
    itemsSubtotalMinor: quote.itemsSubtotal.minor,
    deliveryFeeMinor: quote.deliveryFee.minor,
    surgeMultiplierBps: quote.surgeMultiplierBps,
    surgeFeeMinor: quote.surgeFee.minor,
    smallOrderFeeMinor: quote.smallOrderFee.minor,
    serviceFeeMinor: quote.serviceFee.minor,
    discountMinor: quote.discount.minor,
    vatMinor: quote.vat.minor,
    totalMinor: quote.total.minor,
    promo: promo && {
      code: promo.code,
      applied: promo.applied,
      ...(promo.reason ? { reason: promo.reason } : {}),
      discountMinor: promo.discountMinor,
    },
    computedAt: computedAt.toISOString(),
  };
}

/** Fee rule → DTO. */
export const toFeeRuleDto = (r: StoredFeeRule): FeeRule => ({
  ...r,
  tiers: r.tiers.map((t) => ({ ...t })),
  updatedAt: r.updatedAt.toISOString(),
});

/** Surge rule → DTO. */
export const toSurgeRuleDto = (r: StoredSurgeRule): SurgeRule => ({
  ...r,
  daysOfWeek: [...r.daysOfWeek],
  updatedAt: r.updatedAt.toISOString(),
});

/** Promo → DTO. */
export const toPromoDto = (p: StoredPromo): Promo => ({
  ...p,
  activeDaysOfWeek: p.activeDaysOfWeek ? [...p.activeDaysOfWeek] : null,
  startsAt: p.startsAt.toISOString(),
  endsAt: p.endsAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});
