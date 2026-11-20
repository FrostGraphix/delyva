import type { VendorCategory } from '@delyva/contracts';
import type { LatLng } from '@delyva/utils';
import { CatalogError } from '../domain/catalog-errors.js';
import { assertValidWeeklyHours, type WeeklyInterval } from '../domain/opening-hours.js';
import { catalogPrice, transitionVendor, type VendorStatus } from '../domain/vendor.js';
import type { CatalogWriteRepository, Clock, GeoLookup } from './ports.js';

/** Vendor business details captured during onboarding. */
export interface VendorProfile {
  readonly name: string;
  readonly category: VendorCategory;
  readonly description: string | null;
}

/** Draft menu parsed from an onboarding import (prices in kobo). */
export interface DraftMenu {
  readonly categories: readonly {
    readonly name: string;
    readonly items: readonly {
      readonly name: string;
      readonly description: string | null;
      readonly priceMinor: number;
      readonly available: boolean;
    }[];
  }[];
}

/** New primary branch. */
export interface NewBranch {
  readonly id: string;
  readonly name: string;
  readonly location: LatLng;
  readonly zoneId: string;
  readonly prepMinutes: number;
}

/** Storage used only by vendor onboarding (catalog-owned tables). */
export interface CatalogOnboardingRepository {
  /** Inserts a draft vendor and its owner membership atomically. */
  createDraftVendor(vendorId: string, profile: VendorProfile, ownerUserId: string): Promise<void>;
  /** Updates a vendor that is still `draft`; false otherwise. */
  updateDraftVendor(vendorId: string, profile: VendorProfile): Promise<boolean>;
  /** Inserts or updates the vendor's branch by id. */
  upsertBranch(vendorId: string, branch: NewBranch): Promise<void>;
  /** Replaces the vendor's inactive draft menu (if any) with a new inactive one. */
  replaceDraftMenu(
    vendorId: string,
    menuId: string,
    previous: string | null,
    menu: DraftMenu,
  ): Promise<void>;
  /** Makes `menuId` the vendor's only active menu; false when it is not the vendor's. */
  activateMenu(vendorId: string, menuId: string): Promise<boolean>;
}

/**
 * Public catalog interface for the onboarding context: creates and edits draft vendors,
 * their branch, hours and draft menu, and moves them through draft → in_review (→ draft).
 * Going live stays with {@link ApproveVendor}. Reuses catalog tables; nothing is duplicated.
 */
export class VendorOnboardingService {
  /** @param deps repositories, geo lookup and clock */
  constructor(
    private readonly deps: {
      onboarding: CatalogOnboardingRepository;
      writes: CatalogWriteRepository;
      geo: Pick<GeoLookup, 'zonesContaining'>;
      clock: Clock;
    },
  ) {}

  /** Creates a draft vendor owned by `ownerUserId`; returns its id. */
  async createDraftVendor(ownerUserId: string, profile: VendorProfile): Promise<string> {
    const vendorId = this.deps.clock.uuid();
    await this.deps.onboarding.createDraftVendor(vendorId, profile, ownerUserId);
    return vendorId;
  }

  /** Updates details while the vendor is a draft. @throws CatalogError conflict */
  async updateDraftVendor(vendorId: string, profile: VendorProfile): Promise<void> {
    if (!(await this.deps.onboarding.updateDraftVendor(vendorId, profile))) {
      throw new CatalogError('conflict', 'Vendor details can only change while in draft.');
    }
  }

  /**
   * Pins the branch (zone resolved through geo) and replaces its weekly hours.
   * @throws CatalogError zone_not_serviceable | validation_failed
   */
  async setLocation(
    vendorId: string,
    input: {
      branchId: string | null;
      name: string;
      location: LatLng;
      prepMinutes: number;
      hours: readonly WeeklyInterval[];
    },
  ): Promise<{ branchId: string; zoneId: string }> {
    assertValidWeeklyHours(input.hours);
    const [zoneId] = await this.deps.geo.zonesContaining(input.location);
    if (!zoneId)
      throw new CatalogError(
        'zone_not_serviceable',
        'That location is outside our delivery zones.',
      );
    const branchId = input.branchId ?? this.deps.clock.uuid();
    await this.deps.onboarding.upsertBranch(vendorId, {
      id: branchId,
      name: input.name,
      location: input.location,
      zoneId,
      prepMinutes: input.prepMinutes,
    });
    if (!(await this.deps.writes.replaceHours(vendorId, branchId, input.hours))) {
      throw new CatalogError('not_found', 'Branch not found.');
    }
    return { branchId, zoneId };
  }

  /** Stores an inactive draft menu for ops review, replacing the previous draft. */
  async replaceDraftMenu(
    vendorId: string,
    previous: string | null,
    menu: DraftMenu,
  ): Promise<string> {
    for (const c of menu.categories) for (const i of c.items) catalogPrice(i.priceMinor);
    const menuId = this.deps.clock.uuid();
    await this.deps.onboarding.replaceDraftMenu(vendorId, menuId, previous, menu);
    return menuId;
  }

  /** Activates the reviewed draft menu. @throws CatalogError not_found */
  async activateDraftMenu(vendorId: string, menuId: string): Promise<void> {
    if (!(await this.deps.onboarding.activateMenu(vendorId, menuId))) {
      throw new CatalogError('not_found', 'Draft menu not found.');
    }
  }

  /** Current vendor status. @throws CatalogError not_found */
  async status(vendorId: string): Promise<VendorStatus> {
    const status = await this.deps.writes.vendorStatus(vendorId);
    if (!status) throw new CatalogError('not_found', 'Vendor not found.');
    return status;
  }

  /** draft → in_review (no-op when already in review). @throws CatalogError conflict */
  async submitForReview(vendorId: string): Promise<void> {
    await this.move(vendorId, 'in_review');
  }

  /** in_review → draft after an ops rejection (no-op when already draft). */
  async returnToDraft(vendorId: string): Promise<void> {
    await this.move(vendorId, 'draft');
  }

  private async move(vendorId: string, to: VendorStatus): Promise<void> {
    const from = await this.status(vendorId);
    if (from === to) return;
    transitionVendor(from, to);
    if (!(await this.deps.writes.changeStatus(vendorId, from, to))) {
      throw new CatalogError('conflict', 'Vendor status changed concurrently; retry.');
    }
  }
}
