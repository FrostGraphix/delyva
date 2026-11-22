import type { OrderTotals, QuoteResponse } from '@delyva/contracts';
import type { MessageKey } from '../i18n';

/** One server-computed line of a price breakdown. */
export interface BreakdownRow {
  readonly key: MessageKey;
  /** Signed kobo (discounts are negative). */
  readonly amountMinor: number;
  readonly emphasis?: boolean;
}

interface Parts {
  items: number;
  delivery: number;
  surge: number;
  smallOrder: number;
  service: number;
  discount: number;
  vat: number;
  total: number;
}

function rows(p: Parts): BreakdownRow[] {
  const out: BreakdownRow[] = [
    { key: 'price.items', amountMinor: p.items },
    { key: 'price.delivery', amountMinor: p.delivery },
  ];
  if (p.surge > 0) out.push({ key: 'price.surge', amountMinor: p.surge });
  if (p.smallOrder > 0) out.push({ key: 'price.smallOrder', amountMinor: p.smallOrder });
  out.push({ key: 'price.service', amountMinor: p.service });
  if (p.discount > 0) out.push({ key: 'price.discount', amountMinor: -p.discount });
  if (p.vat > 0) out.push({ key: 'price.vat', amountMinor: p.vat });
  out.push({ key: 'price.total', amountMinor: p.total, emphasis: true });
  return out;
}

/** Breakdown from a server quote (shown before the pay button). Nothing is summed on device. */
export function quoteRows(q: QuoteResponse): BreakdownRow[] {
  return rows({
    items: q.itemsSubtotalMinor,
    delivery: q.deliveryFeeMinor,
    surge: q.surgeFeeMinor,
    smallOrder: q.smallOrderFeeMinor,
    service: q.serviceFeeMinor,
    discount: q.discountMinor,
    vat: q.vatMinor,
    total: q.totalMinor,
  });
}

/** Breakdown from a placed order's totals (receipt). */
export function orderRows(t: OrderTotals): BreakdownRow[] {
  return rows({
    items: t.itemsSubtotal.amountMinor,
    delivery: t.deliveryFee.amountMinor,
    surge: t.surgeFee.amountMinor,
    smallOrder: t.smallOrderFee.amountMinor,
    service: t.serviceFee.amountMinor,
    discount: Math.abs(t.discount.amountMinor),
    vat: t.vat.amountMinor,
    total: t.total.amountMinor,
  });
}
