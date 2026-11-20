# ADR 0300 — Double-entry ledger and payments design

- Status: accepted
- Date: 2026-11-20
- Context: payments (Phase 1)

## Context

Delyva moves customer money to vendors, riders, the platform and the tax authority, and back on refunds. CLAUDE.md requires integer minor units, an append-only double-entry ledger, payment state changes only from verified webhooks or server-side verify calls, webhook dedupe, and nightly reconciliation.

## Decision

1. **Ledger tables** `ledger_accounts` (code + currency, e.g. `customer_wallet:<user>`, `vendor_payable:<vendor>`, `rider_payable:<rider>`, `provider_clearing:<provider>`, `platform_revenue`, `tax_payable`, `promo_expense`), `ledger_transactions` (unique `idempotency_key`, `reference`, optional `reverses_id`) and `ledger_entries` (signed `bigint` kobo; positive = debit, negative = credit).
2. **Invariants enforced twice.** In the domain (`buildJournal`: ≥ 2 lines, no zero lines, known account codes, sum = 0 per currency) and in Postgres (migration `0300_payments.sql`): `CHECK amount_minor <> 0`; a BEFORE INSERT trigger requiring entry currency = account currency; DEFERRABLE INITIALLY DEFERRED constraint triggers on both tables that, at COMMIT, require ≥ 2 entries and a zero sum per currency; BEFORE UPDATE/DELETE/TRUNCATE triggers that raise (append-only); `REVOKE UPDATE, DELETE, TRUNCATE ... FROM PUBLIC`. Triggers are the real guard because the app role owns the tables.
3. **Corrections are new transactions.** Refunds post pro-rata compensating entries (largest-remainder allocation via `Money.allocate`, so no kobo is lost; a full refund also reverses promo funding exactly). Failed payouts post `reverseJournal`.
4. **Balances are derived**, never stored: wallet balance = −Σ entries on `customer_wallet:<user>`. Holds (`wallet_holds`, 15 min TTL) are reservations, not ledger movements; available = balance − active unexpired holds.
5. **Concurrency.** All wallet-changing work runs in one DB transaction under `pg_advisory_xact_lock(hashtextextended('wallet:<user>'))`; intents/holds/payouts are read `FOR UPDATE`. Two concurrent holds cannot overspend (integration-tested).
6. **Money flow.** Every card/transfer payment first credits the customer wallet from `provider_clearing`; an order intent then places a hold for that order. `captureOrderSplit` debits wallet (+ promo expense) and credits vendor/rider/platform/tax payables. Refund to source additionally debits the wallet and credits provider clearing, then calls the provider.
7. **Intent state machine** `requires_action → processing → succeeded | failed`, `succeeded → refunded`. Transitions happen only in `settleIntent`, fed by provider `verify` (from the verify endpoint or from a webhook, which is re-verified server-side). Success requires the exact amount and currency.
8. **Webhooks** `POST /v1/webhooks/paystack`: IP allowlist (env) → HMAC-SHA512 over the raw body (`rawBody: true` in Nest, constant-time compare) → parse → dedupe row `(provider, event_id)` inserted in the same transaction as the effect, so a failed effect lets the provider retry. Paystack bodies have no top-level event id; the key is `<event>:<data.id>`.
9. **Provider port** `PaymentProvider` with `PaystackProvider` (fields taken from the official PaystackOSS OpenAPI spec) and a deterministic `FakePaymentProvider` for tests/dev (forbidden in production by env validation).
10. **Jobs.** Payout and reconciliation logic lives in the API (sole ledger owner). `apps/workers` schedules BullMQ job schedulers that call token-guarded `/internal/payments/*` endpoints. Payout idempotency = deterministic transfer reference per (ISO week, payee), also unique in `payouts`.

## Consequences

- Ledger rows can never be edited; mistakes need compensating entries and audit.
- Raw SQL is used for ledger queries (allowed by the stack table).
- The deferred trigger costs one aggregate per inserted entry at commit; acceptable at launch volume; partition `ledger_entries` by month later.
- Alternatives rejected: stored balances (drift risk), provider-side splits (vendor payouts must survive provider changes), BullMQ workers talking to Postgres directly (two writers to the ledger).
