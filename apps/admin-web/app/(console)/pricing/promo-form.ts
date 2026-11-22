import { CreatePromoSchema, type CreatePromo, type PromoType } from '@delyva/contracts';
import { parseNairaToKobo } from '@/lib/format';

/** Raw promo form values (strings from inputs). */
export interface PromoFormValues {
  readonly code: string;
  readonly type: PromoType;
  readonly value: string;
  readonly percentBps: string;
  readonly maxDiscount: string;
  readonly minOrder: string;
  readonly audience: 'all' | 'new_users';
  readonly startsAt: string;
  readonly endsAt: string;
  readonly perUserLimit: string;
}

/** Lagos-local `datetime-local` value → ISO (Lagos is UTC+1 all year). */
export function lagosLocalToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function optionalKobo(v: string): number | null {
  return v.trim() === '' ? null : parseNairaToKobo(v);
}

/**
 * Builds the create body; amounts in kobo (integers). The server re-validates and enforces
 * eligibility; this only gives fast, plain-language feedback.
 */
export function buildPromo(
  v: PromoFormValues,
): { ok: true; body: CreatePromo } | { ok: false; field: string } {
  const startsAt = lagosLocalToIso(v.startsAt);
  const endsAt = lagosLocalToIso(v.endsAt);
  if (!startsAt || !endsAt || endsAt <= startsAt) return { ok: false, field: 'dates' };
  const minOrder = parseNairaToKobo(v.minOrder);
  if (minOrder === null) return { ok: false, field: 'minOrder' };
  const parsed = CreatePromoSchema.safeParse({
    code: v.code,
    type: v.type,
    valueMinor: v.type === 'fixed_off' ? optionalKobo(v.value) : null,
    percentBps: v.type === 'percent_off' ? Number(v.percentBps) : null,
    maxDiscountMinor: v.type === 'percent_off' ? optionalKobo(v.maxDiscount) : null,
    minOrderMinor: minOrder,
    audience: v.audience,
    startsAt,
    endsAt,
    activeDaysOfWeek: null,
    perUserLimit: Number(v.perUserLimit),
    globalLimit: null,
    budgetMinor: null,
    active: true,
  });
  if (!parsed.success)
    return { ok: false, field: String(parsed.error.issues[0]?.path[0] ?? 'form') };
  return { ok: true, body: parsed.data };
}
