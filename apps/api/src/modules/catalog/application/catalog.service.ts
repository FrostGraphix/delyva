import type { MenuItem } from '@delyva/contracts';
import type { LatLng } from '@delyva/utils';
import { validateSelection } from '../domain/modifiers.js';
import { isOpenAt } from '../domain/opening-hours.js';
import type { VendorMemberRole, VendorStatus } from '../domain/vendor.js';
import type { CatalogWriteRepository, Clock, OrderingCatalogReads } from './ports.js';

/** A branch as seen by ordering at a given instant. */
export interface OrderingBranch {
  readonly branchId: string;
  readonly branchName: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly vendorStatus: VendorStatus;
  readonly zoneId: string;
  readonly location: LatLng;
  readonly prepMinutes: number;
  /** Vendor live, branch active and inside opening hours now. */
  readonly acceptingOrders: boolean;
}

/** A requested line: item + chosen option ids. */
export interface SelectionRequest {
  readonly itemId: string;
  readonly quantity: number;
  readonly optionIds: readonly string[];
}

/** A line priced from the catalog (kobo). `problem` is set when it cannot be ordered now. */
export interface PricedSelection {
  readonly itemId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly options: readonly { id: string; name: string; priceDeltaMinor: number }[];
  readonly problem: string | null;
}

function optionsOf(item: MenuItem, ids: readonly string[]): PricedSelection['options'] {
  const all = item.modifierGroups.flatMap((g) => g.options);
  return ids.flatMap((id) => {
    const o = all.find((x) => x.id === id);
    return o ? [{ id: o.id, name: o.name, priceDeltaMinor: o.priceDelta.amountMinor }] : [];
  });
}

function priceOne(item: MenuItem | undefined, req: SelectionRequest): PricedSelection {
  if (!item) {
    return {
      itemId: req.itemId,
      name: '',
      quantity: req.quantity,
      unitPriceMinor: 0,
      options: [],
      problem: 'Item no longer exists',
    };
  }
  const groups = item.modifierGroups.map((g) => ({
    ...g,
    options: g.options.map((o) => ({
      id: o.id,
      priceDeltaMinor: o.priceDelta.amountMinor,
      available: o.available,
    })),
  }));
  const selection = validateSelection(groups, req.optionIds);
  const problem = !item.available
    ? 'Item is unavailable'
    : selection.ok
      ? null
      : selection.errors.join('; ');
  return {
    itemId: item.id,
    name: item.name,
    quantity: req.quantity,
    unitPriceMinor: item.price.amountMinor,
    options: optionsOf(item, req.optionIds),
    problem,
  };
}

/**
 * Public interface of the catalog context for ordering: branch status and live re-pricing of
 * selections (prices always come from here, never from the client). Callers never touch
 * catalog tables.
 */
export class CatalogService {
  /** @param deps reads, membership lookup and clock */
  constructor(
    private readonly deps: {
      reads: OrderingCatalogReads;
      members: Pick<CatalogWriteRepository, 'memberRole'>;
      clock: Clock;
    },
  ) {}

  /** The branch with vendor status and whether it is accepting orders now; null when unknown. */
  async branch(branchId: string): Promise<OrderingBranch | null> {
    const b = await this.deps.reads.branchSummary(branchId);
    if (!b) return null;
    const open = isOpenAt(b.hours, this.deps.clock.now());
    return {
      branchId: b.branchId,
      branchName: b.branchName,
      vendorId: b.vendorId,
      vendorName: b.vendorName,
      vendorStatus: b.vendorStatus,
      zoneId: b.zoneId,
      location: b.location,
      prepMinutes: b.prepMinutes,
      acceptingOrders: b.vendorStatus === 'live' && b.active && open,
    };
  }

  /** Prices each requested line from the current menu (unknown/unavailable/invalid flagged). */
  async priceSelections(
    vendorId: string,
    lines: readonly SelectionRequest[],
  ): Promise<PricedSelection[]> {
    const items = await this.deps.reads.vendorItems(vendorId);
    const byId = new Map(items.map((i) => [i.id, i]));
    return lines.map((l) => priceOne(byId.get(l.itemId), l));
  }

  /** Membership role of a user in a vendor, or null. */
  memberRole(vendorId: string, userId: string): Promise<VendorMemberRole | null> {
    return this.deps.members.memberRole(vendorId, userId);
  }
}
