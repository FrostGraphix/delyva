import { describe, expect, it } from 'vitest';
import type { CreateFeeRule, CreatePromo } from '@delyva/contracts';
import type { PricingError } from '../domain/pricing-errors.js';
import type {
  Clock,
  ConfigRepository,
  FeeRuleRepository,
  InsertOutcome,
  LockedPromoScope,
  PromoRedemptionUnitOfWork,
  PromoRepository,
  RedemptionRecord,
  StoredFeeRule,
  StoredPromo,
  StoredSurgeRule,
  SurgeRuleRepository,
} from './ports.js';
import { PricingAdmin } from './pricing-admin.js';
import { PricingService } from './pricing.service.js';
import { RedeemPromo } from './redeem-promo.use-case.js';

const NOW = new Date('2026-11-18T09:00:00Z'); // Wednesday 10:00 Lagos
let n = 0;
const clock: Clock = {
  now: () => NOW,
  uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
};

class MemRepo<T extends { id: string }> implements ConfigRepository<T> {
  rows: T[] = [];
  constructor(private readonly key?: (t: T) => string) {}
  list(): Promise<T[]> {
    return Promise.resolve([...this.rows]);
  }
  findById(id: string): Promise<T | null> {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }
  insert(row: T): Promise<InsertOutcome> {
    const key = this.key;
    if (key && this.rows.some((r) => key(r) === key(row))) return Promise.resolve('duplicate');
    this.rows.push(row);
    return Promise.resolve('inserted');
  }
  update(row: T): Promise<void> {
    this.rows = this.rows.map((r) => (r.id === row.id ? row : r));
    return Promise.resolve();
  }
}

class FeeRepo extends MemRepo<StoredFeeRule> implements FeeRuleRepository {
  constructor() {
    super((r) => r.zoneCode);
  }
  findByZone(zone: string): Promise<StoredFeeRule | null> {
    return Promise.resolve(this.rows.find((r) => r.zoneCode === zone) ?? null);
  }
}
class SurgeRepo extends MemRepo<StoredSurgeRule> implements SurgeRuleRepository {
  activeForZone(zone: string): Promise<StoredSurgeRule[]> {
    return Promise.resolve(this.rows.filter((r) => r.zoneCode === zone && r.active));
  }
}
class PromoRepo extends MemRepo<StoredPromo> implements PromoRepository {
  constructor() {
    super((r) => r.code);
  }
  findByCode(code: string): Promise<StoredPromo | null> {
    return Promise.resolve(this.rows.find((r) => r.code === code) ?? null);
  }
}

const feeDto: CreateFeeRule = {
  zoneCode: 'lagos',
  currency: 'NGN',
  baseFeeMinor: 30_000,
  baseDistanceMeters: 3_000,
  tiers: [{ upToMeters: null, perKmMinor: 10_000 }],
  minFeeMinor: 30_000,
  maxFeeMinor: 350_000,
  maxDistanceMeters: 25_000,
  smallOrderThresholdMinor: 200_000,
  smallOrderFeeMinor: 20_000,
  serviceFeeBps: 500,
  serviceFeeCapMinor: 50_000,
  vatBps: 750,
  maxSurgeBps: 15_000,
  active: true,
};

const promoDto: CreatePromo = {
  code: 'TUNDE50',
  type: 'fixed_off',
  valueMinor: 50_000,
  percentBps: null,
  maxDiscountMinor: null,
  minOrderMinor: 0,
  audience: 'new_users',
  startsAt: '2026-01-01T00:00:00Z',
  endsAt: '2027-01-01T00:00:00Z',
  activeDaysOfWeek: null,
  perUserLimit: 1,
  globalLimit: null,
  budgetMinor: 100_000,
  active: true,
};

function setup() {
  const feeRules = new FeeRepo();
  const surgeRules = new SurgeRepo();
  const promos = new PromoRepo();
  const usage = { redemptions: new Map<string, number>(), isNew: true };
  const service = new PricingService({
    feeRules,
    surgeRules,
    promos,
    clock,
    usage: {
      userRedemptionCount: (p, u) => Promise.resolve(usage.redemptions.get(`${p}:${u}`) ?? 0),
      isNewCustomer: () => Promise.resolve(usage.isNew),
    },
  });
  const admin = new PricingAdmin({ feeRules, surgeRules, promos, clock });
  return { feeRules, surgeRules, promos, usage, service, admin };
}

const errCode = (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => 'ok',
    (e: unknown) => (e as PricingError).code,
  );

const quoteCmd = {
  userId: '11111111-1111-4111-8111-111111111111',
  zoneCode: 'lagos',
  pickup: { lat: 6.4281, lng: 3.4219 },
  dropoff: { lat: 6.4281, lng: 3.4219 },
  lines: [{ unitPriceMinor: 300_000, quantity: 1, modifierDeltasMinor: [] }],
};

describe('PricingService.quote', () => {
  it('rejects zones without a fee rule', async () => {
    const { service } = setup();
    expect(await errCode(service.quote(quoteCmd))).toBe('zone_not_serviceable');
  });

  it('prices with no promo and reports promo outcomes', async () => {
    const { service, admin, usage } = setup();
    await admin.createFeeRule(feeDto);
    await admin.createPromo(promoDto);
    const plain = await service.quote(quoteCmd);
    expect(plain.promo).toBeNull();
    expect(plain.quote.deliveryFee.minor).toBe(30_000);
    expect(plain.computedAt).toBe(NOW);

    const applied = await service.quote({ ...quoteCmd, promoCode: ' tunde50 ' });
    expect(applied.promo).toEqual({ code: 'TUNDE50', applied: true, discountMinor: 50_000 });
    expect(applied.quote.discount.minor).toBe(50_000);

    const missing = await service.quote({ ...quoteCmd, promoCode: 'NOPE' });
    expect(missing.promo).toMatchObject({ applied: false, reason: 'not_found', discountMinor: 0 });

    usage.isNew = false;
    const old = await service.quote({ ...quoteCmd, promoCode: 'TUNDE50' });
    expect(old.promo).toMatchObject({ applied: false, reason: 'audience_mismatch' });
    expect(old.quote.discount.minor).toBe(0);
  });
});

describe('PricingAdmin', () => {
  it('creates, conflicts on duplicate zone, updates and validates fee rules', async () => {
    const { admin } = setup();
    const created = await admin.createFeeRule(feeDto);
    expect(await errCode(admin.createFeeRule(feeDto))).toBe('conflict');
    const updated = await admin.updateFeeRule(created.id, {
      baseFeeMinor: 35_000,
      minFeeMinor: 35_000,
    });
    expect(updated.baseFeeMinor).toBe(35_000);
    expect(await admin.listFeeRules()).toHaveLength(1);
    expect(await errCode(admin.updateFeeRule(created.id, { minFeeMinor: 999_999 }))).toBe(
      'validation_failed',
    );
    expect(await errCode(admin.updateFeeRule(clock.uuid(), {}))).toBe('not_found');
    expect(await errCode(admin.createFeeRule({ ...feeDto, zoneCode: 'x', tiers: [] }))).toBe(
      'validation_failed',
    );
  });

  it('manages surge rules', async () => {
    const { admin } = setup();
    const dto = {
      zoneCode: 'lagos',
      daysOfWeek: [1],
      startMinute: 720,
      endMinute: 840,
      multiplierBps: 12_000,
      active: true,
    };
    const s = await admin.createSurgeRule(dto);
    expect((await admin.updateSurgeRule(s.id, { active: false })).active).toBe(false);
    expect(await admin.listSurgeRules()).toHaveLength(1);
    expect(await errCode(admin.updateSurgeRule(s.id, { endMinute: 700 }))).toBe(
      'validation_failed',
    );
    expect(await errCode(admin.createSurgeRule({ ...dto, startMinute: 900 }))).toBe(
      'validation_failed',
    );
  });

  it('manages promos and guards counters on update', async () => {
    const { admin, promos } = setup();
    const p = await admin.createPromo(promoDto);
    expect(p.startsAt).toEqual(new Date(promoDto.startsAt));
    expect(await errCode(admin.createPromo(promoDto))).toBe('conflict');
    const next = await admin.updatePromo(p.id, { endsAt: '2027-06-01T00:00:00Z', active: false });
    expect(next.endsAt.toISOString()).toBe('2027-06-01T00:00:00.000Z');
    expect(next.startsAt).toEqual(p.startsAt);
    await promos.update({ ...next, spentMinor: 80_000, redemptionCount: 3 });
    expect(await errCode(admin.updatePromo(p.id, { budgetMinor: 70_000 }))).toBe(
      'validation_failed',
    );
    expect(await errCode(admin.updatePromo(p.id, { globalLimit: 2 }))).toBe('validation_failed');
    expect(await errCode(admin.updatePromo(p.id, { startsAt: '2030-01-01T00:00:00Z' }))).toBe(
      'validation_failed',
    );
    expect(await admin.listPromos()).toHaveLength(1);
  });
});

class FakeUow implements PromoRedemptionUnitOfWork {
  records: RedemptionRecord[] = [];
  isNew = true;
  constructor(public promo: StoredPromo | null) {}
  async withLockedPromo<T>(
    code: string,
    work: (s: LockedPromoScope) => Promise<T>,
  ): Promise<T | null> {
    const promo = this.promo;
    if (promo?.code !== code) return null;
    const scope: LockedPromoScope = {
      promo,
      userRedemptionCount: (_p, u) =>
        Promise.resolve(this.records.filter((r) => r.userId === u).length),
      isNewCustomer: () => Promise.resolve(this.isNew),
      redemptionForOrder: (o) => Promise.resolve(this.records.find((r) => r.orderId === o) ?? null),
      record: (r) => {
        this.records.push(r);
        this.promo = {
          ...promo,
          redemptionCount: promo.redemptionCount + 1,
          spentMinor: promo.spentMinor + r.discountMinor,
        };
        return Promise.resolve();
      },
    };
    return work(scope);
  }
}

describe('RedeemPromo', () => {
  const user = '11111111-1111-4111-8111-111111111111';
  const order = '22222222-2222-4222-8222-222222222222';
  const make = async () => {
    const { admin } = setup();
    const promo = await admin.createPromo(promoDto);
    const uow = new FakeUow(promo);
    return { uow, redeem: new RedeemPromo({ uow, clock }) };
  };
  const cmd = {
    code: 'tunde50',
    userId: user,
    orderId: order,
    itemsSubtotalMinor: 300_000,
    discountMinor: 50_000,
  };

  it('records once and replays idempotently for the same order', async () => {
    const { uow, redeem } = await make();
    const first = await redeem.execute(cmd);
    expect(first.replayed).toBe(false);
    const again = await redeem.execute(cmd);
    expect(again).toEqual({ redemption: first.redemption, replayed: true });
    expect(uow.records).toHaveLength(1);
    expect(await errCode(redeem.execute({ ...cmd, discountMinor: 1 }))).toBe('conflict');
  });

  it('enforces per-user limits and the budget', async () => {
    const { redeem } = await make();
    await redeem.execute(cmd);
    expect(await errCode(redeem.execute({ ...cmd, orderId: clock.uuid() }))).toBe(
      'promo_ineligible',
    );
    const other = '33333333-3333-4333-8333-333333333333';
    expect(
      await errCode(
        redeem.execute({ ...cmd, userId: other, orderId: clock.uuid(), discountMinor: 50_001 }),
      ),
    ).toBe('promo_ineligible');
    await redeem.execute({ ...cmd, userId: other, orderId: clock.uuid() });
    const third = '44444444-4444-4444-8444-444444444444';
    expect(await errCode(redeem.execute({ ...cmd, userId: third, orderId: clock.uuid() }))).toBe(
      'promo_ineligible',
    );
  });

  it('rejects unknown codes and bad amounts', async () => {
    const { redeem } = await make();
    expect(await errCode(redeem.execute({ ...cmd, code: 'NOPE' }))).toBe('not_found');
    expect(await errCode(redeem.execute({ ...cmd, discountMinor: -1 }))).toBe('validation_failed');
    expect(await errCode(redeem.execute({ ...cmd, discountMinor: 1.5 }))).toBe('validation_failed');
  });
});
