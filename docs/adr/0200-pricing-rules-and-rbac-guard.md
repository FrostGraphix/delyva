# ADR 0200 — Pricing calculation rules, promo concurrency and the shared RBAC guard

- Status: accepted
- Date: 2026-11-19

## Context

Phase 1 needs server-side pricing (fees, surge, promos, VAT) that ordering can call, admin-editable config, and the first protected routes. No RBAC guard existed.

## Decision

1. Pricing maths is a pure domain module using integer kobo and basis points, BigInt for intermediate products, half-up rounding for charges and floor for percentage discounts. Delivery fee is per started km with tiers, clamped to min/max; surge is the highest matching rule (no compounding), capped per zone; VAT applies to platform fees only.
2. Config lives in Postgres (`fee_rules`, `surge_rules`, `promos`, `promo_redemptions`, migration `0200_pricing`) and is edited through `/v1/admin/*` routes, never hard-coded; launch values are a re-runnable seed.
3. Promo redemption runs in one transaction with a row lock on the promo, re-checks eligibility under the lock, relies on `UNIQUE(promo_id, order_id)` for idempotency and `CHECK` constraints as the last guard against over-spend; the event goes through the outbox.
4. A generic `AuthGuard` + `@Roles` lives in `src/shared/auth`, depending only on an `ACCESS_TOKEN_VERIFIER` port; modules provide the verifier (in-process EdDSA verification with identity's public key).

## Consequences

- Concurrent redemptions of one promo serialise on its row (fine at launch volume; shard counters if a promo becomes hot).
- Other modules reuse the guard by importing `IdentityModule` and providing the verifier; a later refactor may move the verifier provider into `IdentityModule` exports.
- Adding `patch`, `auth` and path parameters to the contracts `RouteSpec` is additive.
