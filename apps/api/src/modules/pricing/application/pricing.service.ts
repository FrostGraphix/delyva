import { haversineMeters, type LatLng } from '@delyva/utils';
import {
  type ApplicablePromo,
  calculatePriceQuote,
  itemsSubtotalMinor,
  type PriceQuote,
  type QuoteLineInput,
} from '../domain/price-quote.js';
import { PricingError } from '../domain/pricing-errors.js';
import { evaluatePromo, type PromoRejection } from '../domain/promo.js';
import type {
  Clock,
  FeeRuleRepository,
  PromoRepository,
  PromoUsageReader,
  SurgeRuleRepository,
} from './ports.js';

/** Input for {@link PricingService.quote}. Prices must come from a trusted source (see DEBT in controller). */
export interface QuoteCommand {
  readonly userId: string;
  readonly zoneCode: string;
  readonly pickup: LatLng;
  readonly dropoff: LatLng;
  readonly lines: readonly QuoteLineInput[];
  readonly promoCode?: string | undefined;
}

/** Promo outcome attached to a quote. `not_found` is reported instead of an error. */
export interface QuotePromoOutcome {
  readonly code: string;
  readonly applied: boolean;
  readonly reason?: PromoRejection | 'not_found';
  readonly discountMinor: number;
}

/** Quote plus promo outcome and the instant it was computed at. */
export interface QuoteResult {
  readonly quote: PriceQuote;
  readonly promo: QuotePromoOutcome | null;
  readonly computedAt: Date;
}

/** Collaborators. */
export interface PricingServiceDeps {
  readonly feeRules: FeeRuleRepository;
  readonly surgeRules: SurgeRuleRepository;
  readonly promos: PromoRepository;
  readonly usage: PromoUsageReader;
  readonly clock: Clock;
}

/** Straight-line distance rounded UP to the metre (never under-charges). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  return Math.ceil(haversineMeters(a, b));
}

/**
 * Public pricing interface. `quote` is the ONLY way other modules (ordering) obtain prices,
 * so totals are always computed server-side.
 */
export class PricingService {
  /** @param deps collaborators */
  constructor(private readonly deps: PricingServiceDeps) {}

  /** Prices a cart for a customer at the current instant. */
  async quote(cmd: QuoteCommand): Promise<QuoteResult> {
    const now = this.deps.clock.now();
    const feeRule = await this.deps.feeRules.findByZone(cmd.zoneCode);
    if (!feeRule)
      throw new PricingError('zone_not_serviceable', 'Delivery is not available in this zone yet.');
    const surgeRules = await this.deps.surgeRules.activeForZone(cmd.zoneCode);
    const resolved = await this.resolvePromo(cmd, now);
    const quote = calculatePriceQuote({
      zoneCode: cmd.zoneCode,
      lines: cmd.lines,
      distanceMeters: distanceMeters(cmd.pickup, cmd.dropoff),
      at: now,
      feeRule,
      surgeRules,
      promo: resolved.applicable,
    });
    const promo = resolved.outcome && {
      ...resolved.outcome,
      discountMinor: resolved.applicable ? quote.discount.minor : 0,
    };
    return { quote, promo, computedAt: now };
  }

  private async resolvePromo(
    cmd: QuoteCommand,
    now: Date,
  ): Promise<{ applicable: ApplicablePromo | null; outcome: QuotePromoOutcome | null }> {
    if (!cmd.promoCode) return { applicable: null, outcome: null };
    const code = cmd.promoCode.trim().toUpperCase();
    const promo = await this.deps.promos.findByCode(code);
    if (!promo) return { applicable: null, outcome: rejected(code, 'not_found') };
    const result = evaluatePromo(promo, {
      now,
      itemsSubtotalMinor: itemsSubtotalMinor(cmd.lines),
      isNewCustomer: await this.deps.usage.isNewCustomer(cmd.userId),
      userRedemptionCount: await this.deps.usage.userRedemptionCount(promo.id, cmd.userId),
    });
    if (!result.eligible) return { applicable: null, outcome: rejected(code, result.reason) };
    return {
      applicable: { promo, remainingBudgetMinor: result.remainingBudgetMinor },
      outcome: { code, applied: true, discountMinor: 0 },
    };
  }
}

function rejected(code: string, reason: PromoRejection | 'not_found'): QuotePromoOutcome {
  return { code, applied: false, reason, discountMinor: 0 };
}
