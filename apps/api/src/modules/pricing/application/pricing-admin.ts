import type {
  CreateFeeRule,
  CreatePromo,
  CreateSurgeRule,
  UpdateFeeRule,
  UpdatePromo,
  UpdateSurgeRule,
} from '@delyva/contracts';
import { feeRuleIssues } from '../domain/fee-rule.js';
import { PricingError } from '../domain/pricing-errors.js';
import { promoIssues } from '../domain/promo.js';
import { surgeRuleIssues } from '../domain/surge.js';
import type {
  Clock,
  ConfigRepository,
  FeeRuleRepository,
  PromoRepository,
  StoredFeeRule,
  StoredPromo,
  StoredSurgeRule,
  SurgeRuleRepository,
} from './ports.js';

function assertValid(issues: string[]): void {
  if (issues.length > 0) throw new PricingError('validation_failed', issues.join('; '));
}

async function insertUnique<T extends { id: string }>(
  repo: ConfigRepository<T>,
  row: T,
  what: string,
): Promise<T> {
  if ((await repo.insert(row)) === 'duplicate') {
    throw new PricingError('conflict', `${what} already exists.`);
  }
  return row;
}

async function load<T extends { id: string }>(
  repo: ConfigRepository<T>,
  id: string,
  what: string,
): Promise<T> {
  const row = await repo.findById(id);
  if (!row) throw new PricingError('not_found', `${what} not found.`);
  return row;
}

function counterIssues(p: StoredPromo): string[] {
  const issues: string[] = [];
  if (p.budgetMinor !== null && p.budgetMinor < p.spentMinor)
    issues.push('budgetMinor is below spentMinor');
  if (p.globalLimit !== null && p.globalLimit < p.redemptionCount) {
    issues.push('globalLimit is below redemptionCount');
  }
  return issues;
}

type PromoDates = Pick<CreatePromo, 'startsAt' | 'endsAt'>;
const toDates = <T extends Partial<PromoDates>>(dto: T) => ({
  ...dto,
  ...(dto.startsAt === undefined ? {} : { startsAt: new Date(dto.startsAt) }),
  ...(dto.endsAt === undefined ? {} : { endsAt: new Date(dto.endsAt) }),
});

/** Admin use cases for pricing configuration (callers are authorised as ops/super_admin). */
export class PricingAdmin {
  /** @param deps repositories + clock */
  constructor(
    private readonly deps: {
      feeRules: FeeRuleRepository;
      surgeRules: SurgeRuleRepository;
      promos: PromoRepository;
      clock: Clock;
    },
  ) {}

  /** Lists fee rules. */
  listFeeRules(): Promise<StoredFeeRule[]> {
    return this.deps.feeRules.list();
  }

  /** Creates a zone fee rule; one per zone. */
  async createFeeRule(dto: CreateFeeRule): Promise<StoredFeeRule> {
    const row: StoredFeeRule = {
      ...dto,
      id: this.deps.clock.uuid(),
      updatedAt: this.deps.clock.now(),
    };
    assertValid(feeRuleIssues(row));
    return insertUnique(this.deps.feeRules, row, 'A fee rule for this zone');
  }

  /** Patches a fee rule and re-validates the whole rule. */
  async updateFeeRule(id: string, patch: UpdateFeeRule): Promise<StoredFeeRule> {
    const current = await load(this.deps.feeRules, id, 'Fee rule');
    const next: StoredFeeRule = { ...current, ...patch, updatedAt: this.deps.clock.now() };
    assertValid(feeRuleIssues(next));
    await this.deps.feeRules.update(next);
    return next;
  }

  /** Lists surge rules. */
  listSurgeRules(): Promise<StoredSurgeRule[]> {
    return this.deps.surgeRules.list();
  }

  /** Creates a surge rule. */
  async createSurgeRule(dto: CreateSurgeRule): Promise<StoredSurgeRule> {
    const row: StoredSurgeRule = {
      ...dto,
      id: this.deps.clock.uuid(),
      updatedAt: this.deps.clock.now(),
    };
    assertValid(surgeRuleIssues(row));
    return insertUnique(this.deps.surgeRules, row, 'This surge rule');
  }

  /** Patches a surge rule. */
  async updateSurgeRule(id: string, patch: UpdateSurgeRule): Promise<StoredSurgeRule> {
    const current = await load(this.deps.surgeRules, id, 'Surge rule');
    const next: StoredSurgeRule = { ...current, ...patch, updatedAt: this.deps.clock.now() };
    assertValid(surgeRuleIssues(next));
    await this.deps.surgeRules.update(next);
    return next;
  }

  /** Lists promos with counters. */
  listPromos(): Promise<StoredPromo[]> {
    return this.deps.promos.list();
  }

  /** Creates a promo; codes are unique. */
  async createPromo(dto: CreatePromo): Promise<StoredPromo> {
    const row: StoredPromo = {
      ...toDates(dto),
      id: this.deps.clock.uuid(),
      redemptionCount: 0,
      spentMinor: 0,
      updatedAt: this.deps.clock.now(),
    };
    assertValid(promoIssues(row));
    return insertUnique(this.deps.promos, row, 'A promo with this code');
  }

  /** Patches a promo (code, type and counters are immutable). */
  async updatePromo(id: string, patch: UpdatePromo): Promise<StoredPromo> {
    const current = await load(this.deps.promos, id, 'Promo');
    const next: StoredPromo = { ...current, ...toDates(patch), updatedAt: this.deps.clock.now() };
    assertValid([...promoIssues(next), ...counterIssues(next)]);
    await this.deps.promos.update(next);
    return next;
  }
}
