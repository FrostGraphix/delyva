# ADR 0001 — Drizzle ORM for data access

- Status: Accepted
- Date: 2026-11-19
- Deciders: Phase 0 foundations

## Context

The tech stack allows Prisma or Drizzle on PostgreSQL 16 + PostGIS, with raw SQL for geo and ledger
queries. The API is an ESM NestJS modular monolith where each bounded context owns its tables.

## Decision

Use **Drizzle ORM 0.45.4** (`drizzle-orm/node-postgres` over `pg` 8.23.1) with **drizzle-kit 0.31.11**
generating SQL migrations into `apps/api/drizzle/`.

- Each context declares its tables in `src/modules/<context>/infrastructure/*.schema.ts`; shared
  tables (outbox) live in `src/shared/outbox/outbox.schema.ts`.
- Migrations are plain, reviewable SQL files (custom migrations for extensions such as PostGIS) applied
  by `pnpm --filter @delyva/api db:migrate` (Drizzle migrator).
- Repositories are infrastructure adapters behind application ports; domain code never imports Drizzle.

## Rationale

- SQL-first: generated SQL is reviewed like code, which suits expand → migrate → contract migrations,
  PostGIS, and hand-written ledger SQL in the same transaction.
- No code-generation step or separate query engine binary: smaller runtime and faster cold starts in
  Fargate, fewer moving parts in CI.
- Type-safe query builder without leaking ORM entities into the domain.
- Licence: Apache-2.0 (drizzle-orm, drizzle-kit).

## Consequences

- No built-in rollback ("down") migrations; reversibility is handled by expand/contract and by writing
  explicit compensating migrations. Recorded as DEBT in ARCHITECTURE.md.
- Drizzle is pre-1.0; pin exact versions and upgrade deliberately.
- PostGIS geometry columns will use `customType` or raw SQL.
