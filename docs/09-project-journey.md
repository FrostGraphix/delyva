# 09 · The Delyva Journey — from idea to today, and where next

_Written 2026-11-23, from the git history (2026-11-19 → 2026-11-22), `CLAUDE.md`, `docs/ARCHITECTURE.md`, and ADRs 0001–0840._

## 1. What Delyva is

A multi-sided on-demand delivery platform for Lagos (food, groceries, pharmacy, parcels, under 35 min), in the class of Chowdeck / Glovo / Uber Eats. Four surfaces on one backend:

| Surface | Tech | Status |
| --- | --- | --- |
| Customer app | Expo / React Native | Built (Phase 1) |
| Rider app | Expo / React Native | Built (Phase 1) |
| Vendor portal | Next.js 16 | Built (Phase 1) |
| Admin console | Next.js 16 | Built (Phase 1) |
| API + workers | NestJS modular monolith, BullMQ | Built (Phase 1 contexts) |

Brand: **Delyva — "Delivered Your Way."** Lime green `#8CC63F` + near-black ink, glass cards, rounded corners; an orange accent theme was added later.

## 2. The journey, in order

### Stage 0 — Product and design (before code)
- Business proposal turned into docs 01–08: product and business, system flows, architecture, data and API, features by app, delivery pipeline, design system, screens and UX.
- Clickable HTML prototypes in `/design` (customer, merchant, rider, admin, design-system) sharing `design/assets/delyva.css` tokens.
- `CLAUDE.md` set the operating rules: architect-first workflow, strict TypeScript, contracts as single source of truth, server-computed money, five UI states, ADR for every structural decision.

### Stage 1 — Phase 0 foundations (2026-11-19)
- pnpm + Turborepo monorepo; shared config, `utils` (Money etc.), `contracts` (Zod), `design-tokens`.
- NestJS API with identity (phone OTP, EdDSA JWT, rotating refresh tokens with reuse detection), transactional outbox, Idempotency-Key, Redis rate limiter, problem+json errors, `/healthz` `/readyz`, OpenAPI generated from contracts.
- Typed SDK with TanStack Query hooks, icons, `ui-web` / `ui-native` buttons; Expo and Next.js scaffolds; BullMQ workers.
- GitHub Actions with gitleaks; local Docker Compose (Postgres+PostGIS 55432, Redis 56379).
- **Decisions:** ADR 0001 Drizzle ORM, ADR 0002 ESM + TypeScript 6.0.3 (TS 7 unsupported by typescript-eslint), ADR 0003 OTP auth and sessions. All versions pinned exactly.

### Stage 2 — Phase 1 backend, built in parallel contexts (2026-11-20)
Each bounded context was built on its own branch, then merged, with migrations rechained and the OpenAPI spec regenerated. Merging many parallel branches was the main source of friction (journal order, drizzle snapshots, a lost SDK brace).

| Context | What shipped | ADR |
| --- | --- | --- |
| Pricing | Quotes, tiered fees, surge, promos with locked redemption, RBAC guard | 0200 |
| Notifications + realtime | Push/SMS templates, Socket.IO gateway, worker delivery | 0400 |
| Catalog + geo | Vendor discovery, menus, modifiers, hours, addresses, zones, ownership guard | 0100 |
| Payments + ledger | Append-only double-entry ledger, payment intents, wallet holds, Paystack + fake provider, webhooks, payouts, reconciliation | 0300 |
| Ordering | Carts, server-side checkout, explicit state machine, vendor/ops actions, fulfilment port | 0500 |
| Dispatch | Rider availability, offers, Redis-locked assignment, trips, ops override | 0600 |
| Onboarding + admin | Rider/vendor KYC applications, AES-256-GCM field encryption, signed-URL storage, audit log, feature flags, TOTP 2FA | 0700 |

An end-to-end integration test covers vendor accepted → dispatch → delivered → ledger.

### Stage 3 — Wave C: the four apps (2026-11-21 → 11-22)
Built in parallel on `wave-c/*` branches and merged in turn, with new API support (`GET /v1/me/vendors`, single-use realtime handshake tickets).
- **Vendor portal:** cookie-session BFF with CSRF, OTP login, live orders board with a loud new-order alert, menu, hours, earnings, settings, onboarding wizard (ADR 0820).
- **Admin console:** BFF auth, console pages, surge-rule SDK methods, Playwright click-through against the real API (ADR 0830).
- **Customer app:** screens, state, SDK wiring, unit tests, Playwright web harness (ADR 0800).
- **Rider app:** onboarding, home, offers, trips, offline action queue, location, 24-screen E2E suite.
- Shared `ui-web`, `ui-native` and `icons` grew to support all four.

### Stage 4 — Wave D: theming (2026-11-22)
- Orange accent theme beside green in `design-tokens` (`themeColors(scheme, accent)`, AA contrast tests), prototype theme switcher, and cookie-based accent selection in vendor and admin web with no flash (ADR 0840).
- Branches `wave-d/theme-mobile` and `wave-d/hardening` exist but have no commits beyond `main` — **mobile theming and hardening have not started.**

## 3. Where we are now (2026-11-23)

- **Phase 0 and Phase 1 are feature-complete in code** on `main` (last commit `3067bf3`): 10 ADRs-worth of decisions, all four apps, and all core contexts.
- The core loop works against a local stack: discover → quote → checkout → pay → vendor accept → dispatch → deliver → ledger split.
- **Not yet true:** none of it has run against live providers or in a deployed environment. No staging, no Terraform, no real Paystack, Termii, KYC or Google Maps calls.
- Housekeeping: about ten stale agent worktrees and branches remain under `.claude/worktrees` and can be pruned. The `Delyva design.zip` in the repo root is an unreferenced artifact.

## 4. Known gaps (the debt register)

Every gap is marked `// DEBT(area)` in code and listed in `ARCHITECTURE.md`. The ones that matter most:

**Launch blockers**
1. **Live provider verification:** Paystack (refund and transfer flows), Termii, KYC vendor (Smile ID / Dojah / Prembly not chosen), Google Maps, S3 — all tested only against mocks.
2. **Infra:** no Terraform, no staging, no OpenTelemetry/Sentry, no `trust proxy` / helmet / CORS (affects webhook IP allowlist and rate limits).
3. **Money completeness:** no admin refund endpoint with reason, audit log and second approver; reconciliation covers charges only; no rider payouts or rider balance; promo redemptions not reversed on cancel.
4. **Admin 2FA coverage:** pricing admin and catalog go-live are not yet behind `AdminTwoFactorGuard`.
5. **Mobile performance:** customer bundle about 2.6 MB against the 2 MB target; tokens not yet in expo-secure-store.

**Product gaps**
- Rider app: foreground-only location (needs expo-task-manager and a dev build), AsyncStorage instead of MMKV, no offer earnings shown, SOS placeholder, no cash-out.
- Admin: no GMV or cancellation reporting, no order detail endpoint, no audit-log read endpoint, schematic map instead of Google Maps.
- Vendor: no payout/balance read, no busy mode, no category CRUD, orders polled every 5 s.
- Platform: no search (Meilisearch), no Redis/CDN caching of discovery, NATS JetStream adapter pending, no DLQ replay tool, English only, CSP still allows `'unsafe-inline'`.

## 5. Where we are going

### Next: Wave D hardening and Phase 1 completion (recommended order)
1. **Mobile accent theme** (`wave-d/theme-mobile`) — small, finishes the theming slice.
2. **Money and trust hardening:** admin refunds with second approver and audit log, rider payables and cash-out, promo reversal, 2FA on all admin routes, audit-log read endpoint.
3. **Platform hardening:** helmet/CORS/trust proxy, OpenTelemetry + Sentry, Testcontainers, move workers out of the API process, JetStream consumer, DLQ replay.
4. **Real device work:** EAS dev client, background location, MMKV, secure-store tokens, bundle diet, test on a throttled 3G Tecno-class phone.
5. **Provider sandboxes:** Paystack, Termii, chosen KYC vendor, Google Maps.
6. **Infra and staging:** Terraform, Dockerfiles, deploy pipeline, preview environments, backups.
7. **Cross-app E2E** (Maestro + Playwright) for the full order, cancel and refund paths, plus k6 load scripts.
8. **Pilot:** one city, a small set of vendors and riders, behind feature flags.

### Phase 2 — Scale and trust
Promos and referrals, rider batching behind the `DispatchStrategy` interface, ratings and reviews, fraud rules (promo abuse, GPS sanity, collusion), scheduled orders, support tooling and chat, analytics (PostHog funnels), Meilisearch.

### Phase 3 — Expansion
Groceries and pharmacy, multi-city and multi-currency, subscriptions (free delivery), vendor ads, public partner API, extraction of `dispatch` and `notifications` into services if load requires.

## 6. Decisions that shaped the project

- One language (TypeScript) and one repo, so contracts, validation and the SDK are shared everywhere.
- Modular monolith with strict bounded contexts; extract later without touching callers.
- Contract-first: Zod in `packages/contracts` generates the OpenAPI spec and typed SDK.
- Server owns prices, fees, promos and order state; money is integer kobo, ledger is append-only.
- Cross-context coupling goes through ports and outbox events (e.g. ordering's fulfilment port bound to dispatch).
- Web apps use cookie-session BFFs rather than browser-held tokens; mobile uses secure storage.
- Honest empty states over faked data (admin shows "Needs reporting endpoint", not invented numbers).
- Work was done as vertical slices on parallel branches, each ending with an ADR, an architecture section, tests and a regenerated OpenAPI spec.

## 7. Where to find things

| Need | Location |
| --- | --- |
| Rules and stack | `CLAUDE.md`, `docs/ARCHITECTURE.md` |
| Product, flows, UX | `docs/01`–`08`, `/design/index.html` |
| Decisions | `docs/adr/` |
| Run locally | `README.md` ("Running locally") |
| E2E suites | `tests/e2e`, `tests/README.md` |
