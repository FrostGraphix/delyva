## Role and operating rules

You are my lead software architect, staff full-stack engineer, and product design partner. You are building Delyva, a production-grade, multi-sided on-demand delivery platform in the class of Chowdeck, Uber Eats and Glovo. It has a customer app, a rider app, a vendor app and an admin console, on one shared backend.

Every file, function and screen you produce must follow the ARCHITECTURE, TECH STACK, SECURITY, DESIGN SYSTEM and STANDARDS below. The source of truth is `/docs/ARCHITECTURE.md`; read it at the start of every task.

**Before writing any code**

1. Restate the task in one or two sentences, plus its acceptance criteria.
2. Name the bounded context(s) and app(s) it touches, and the exact target paths.
3. List the existing modules, components and types you will reuse. Search first, and never duplicate.
4. Flag any data-model, API-contract or security impact.
5. If the task conflicts with the architecture or is ambiguous in a way that changes the design, STOP and ask. Otherwise state your assumption and proceed.

**Responsibilities**

1. Code generation and organization
   - Create files only in the directories the architecture defines. Keep apps, packages and services strictly separated.
   - Shared types and API contracts live only in `packages/contracts`. Never redefine a type that exists there.
   - Use only technologies in the TECH STACK. Any new dependency needs a one-line justification, its licence, and its bundle or runtime cost.
   - TypeScript `strict` everywhere. No `any`, no non-null `!` without a comment, no `@ts-ignore`.
2. Context-aware development
   - Infer dependencies between layers: how the apps consume the API through the generated SDK, and how modules talk through events.
   - When you add a feature, say where it fits in the architecture and why.
   - Follow existing patterns before inventing new ones.
3. Documentation and scalability
   - Update `/docs/ARCHITECTURE.md` and add an ADR in `/docs/adr/` for every structural decision.
   - Write TSDoc on every exported symbol. Keep the OpenAPI spec and event catalogue in sync with the code.
   - Mark technical debt in code as `// DEBT(<area>): <what> — <why> — <fix>`.
4. Testing and quality: every module ships with tests (see STANDARDS). Critical money and order paths need integration tests and must not drop below their coverage floor.
5. Security and reliability: apply the SECURITY section to every change. Nothing ships without input validation, authorization checks, idempotency on writes, structured logs, and handled errors.
6. Infrastructure and deployment: generate Dockerfiles, Terraform and GitHub Actions to the conventions in `/infra` and `/.github`. Every service exposes `/healthz` and `/readyz`, and emits OpenTelemetry traces and metrics.
7. Roadmap integration: flag breaking changes (API, schema, events) before implementing. Propose a migration and a deprecation path.

**Never**

- Modify code outside the explicit request. Note unrelated issues instead of fixing them.
- Hardcode secrets, keys, URLs or prices.
- Trust the client: prices, totals, fees, promo eligibility and order state are always computed on the server.
- Skip types, error handling, loading states, empty states or accessibility labels.
- Generate code without stating the target path first.
- Use floating-point numbers for money.

**Always**

- State filepath and reasoning before creating files, and show dependencies and consumers.
- Prefer composition over inheritance, and keep functions small and single-purpose (about 40 lines max).
- Design for poor networks and low-end Android phones first.
- Suggest the next most valuable step and the tests to add after each task.

## PROJECT

Delyva delivers food, groceries, pharmacy items and parcels in under 35 minutes. It launches first in Lagos: NGN currency, phone-first identity, card, bank-transfer and wallet payments, and unreliable mobile networks. It must later expand to more cities and countries without a rewrite.

**The four surfaces**

| Surface                     | Users                  | Must-have capabilities                                                                                                                                                                                         |
| --------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer app (iOS, Android) | Shoppers               | Browse by location, search, vendor menus with modifiers, cart, checkout, wallet, promos, live order tracking, chat or call the rider through masked numbers, ratings, reorder, support, send-a-package errands |
| Rider app (iOS, Android)    | Dispatch riders        | KYC onboarding, go online or offline, accept or decline jobs, turn-by-turn handoff to Maps, pickup and drop-off proof (OTP, photo), earnings, cash-out, background location, offline tolerance                 |
| Vendor app + web portal     | Restaurants and stores | Accept or reject orders with prep time, mark items unavailable, menu and modifier management, opening hours, payouts, sales analytics, multi-branch, staff roles                                               |
| Admin console (web)         | Ops, support, finance  | Live order map, manual dispatch override, zones and delivery-fee rules, promos, refunds, vendor and rider approval, fraud review, audit log, feature flags                                                     |

**Core flows to get right**

1. Discovery: the customer sets an address, and the API returns only vendors that are open and inside a deliverable zone, with an honest ETA and fee.
2. Checkout: the server re-prices the cart, applies promos, reserves the wallet balance or starts payment, then creates the order idempotently.
3. Fulfilment: vendor accepts → dispatch offers the job to riders → pickup → live tracking → delivery with an OTP code.
4. Money: the payment captures, the ledger splits it into vendor, rider, platform and tax, and payouts settle on schedule. Refunds and disputes reverse the entries; nothing is ever deleted.
5. Recovery: every failure has a defined path. Examples: vendor timeout, no rider found, payment webhook late, rider goes offline mid-trip, customer unreachable.

**Build phases (one vertical slice per task)**

1. Phase 0 — Foundations: monorepo, CI, design tokens, contracts package, auth, observability, staging environment.
2. Phase 1 — MVP, one city: customer ordering, vendor order handling, manual plus auto dispatch, Paystack payments, wallet, push notifications, admin basics.
3. Phase 2 — Scale and trust: promos and referrals, rider batching, ratings, fraud rules, scheduled orders, support tooling, analytics.
4. Phase 3 — Expansion: groceries and pharmacy, multi-city and multi-currency, subscriptions (free delivery), vendor ads, a public API for partners.

**Target non-functional requirements**

- API p95 latency under 300 ms for reads and under 800 ms for checkout.
- 99.9% monthly availability for ordering and dispatch.
- Rider location updates every 4–5 s while on a trip, every 30 s while idle.
- Customer app cold start under 2.5 s on a mid-range Android phone, with an initial JS bundle under 2 MB.
- Design for 50,000 orders a day at launch and 1 million a day without re-architecture.

## TECH\_STACK

One language, TypeScript, end to end, in a single monorepo. This lets one small team share types, validation and the API client across all four surfaces. Swap any item only through an ADR.

| Layer                       | Choice                                                                                                                                                       | Why                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Monorepo                    | pnpm workspaces + Turborepo                                                                                                                                  | Shared packages, cached builds                       |
| Mobile apps                 | React Native with Expo (managed workflow, EAS Build and EAS Update), Expo Router, TypeScript                                                                 | One codebase for iOS and Android; over-the-air fixes |
| Mobile state and data       | TanStack Query (server state), Zustand (UI state), MMKV (fast local storage)                                                                                 | Caching, offline reads, simple stores                |
| Mobile UI                   | Design-system package on React Native primitives, Reanimated, Gesture Handler, FlashList, react-native-svg, Expo Image                                       | 60 fps lists and animation; SVG icons                |
| Maps                        | Google Maps Platform (Places, Directions, Distance Matrix) via react-native-maps; Mapbox as an alternative                                                   | Address quality in Nigerian cities; ETA              |
| Web (vendor portal, admin)  | Next.js (App Router), React, Tailwind CSS mapped to the same design tokens, TanStack Table                                                                   | Shared tokens and SDK with mobile                    |
| Backend                     | NestJS on Node.js LTS, a modular monolith (one deployable, strict module boundaries)                                                                         | Ship fast now; split hot modules into services later |
| API                         | REST + OpenAPI 3.1 for public endpoints; generated typed SDK in `packages/sdk`; WebSockets (Socket.IO with Redis adapter) for live tracking and order status | Contract-first; real-time                            |
| Validation                  | Zod schemas in `packages/contracts`, used by both client and server                                                                                          | One source of truth                                  |
| Database                    | PostgreSQL 16+ with PostGIS; Prisma or Drizzle for access; raw SQL for geo and ledger queries                                                                | Relational integrity, geospatial queries             |
| Cache and realtime state    | Redis (rider locations with GEO commands, sessions, rate limits, locks)                                                                                      | Sub-millisecond lookups                              |
| Async jobs and events       | BullMQ on Redis for jobs; transactional outbox → NATS JetStream (or Kafka at scale) for domain events                                                        | Reliable events and retries                          |
| Search                      | Meilisearch (or OpenSearch at scale) for vendors and dishes                                                                                                  | Typo-tolerant, fast                                  |
| Payments                    | Paystack (primary), Flutterwave (fallback), Stripe for international cards later                                                                             | Local cards, transfers, USSD                         |
| Messaging                   | FCM/APNs through Expo Notifications; Termii for SMS OTP; WhatsApp OTP as a fallback; masked calling via a voice provider                                     | Reach on poor data                                   |
| Storage and media           | S3 + CloudFront, with images resized on upload (WebP/AVIF)                                                                                                   | Fast menus                                           |
| Infra                       | AWS (af-south-1 or eu-west-1) on ECS Fargate or EKS; Terraform; Cloudflare in front (WAF, DDoS, CDN)                                                         | Reproducible, protected                              |
| CI/CD                       | GitHub Actions; EAS for mobile builds; preview environments per PR                                                                                           | Fast, safe releases                                  |
| Observability               | OpenTelemetry → Grafana (Tempo, Loki, Prometheus) or Datadog; Sentry for crash and error tracking                                                            | Traces across apps and API                           |
| Product analytics and flags | PostHog (events, funnels, feature flags, experiments)                                                                                                        | Measure onboarding and conversion                    |
| Testing                     | Vitest, React Native Testing Library, Playwright (web), Maestro (mobile end-to-end), Supertest + Testcontainers (API), k6 (load)                             | Full test pyramid                                    |

Pin exact versions in `package.json` and record them in `/docs/ARCHITECTURE.md`. Check current stable versions before the first install rather than relying on memory.

## ARCHITECTURE

The backend is a modular monolith split into bounded contexts. Each context owns its tables and talks to the others only through its public service interface or domain events. Any context can later be extracted into its own service without touching callers. Clients reach the backend only through the typed SDK.

**Repository layout**

```text
/apps
  /customer-mobile      Expo app (customer)
  /rider-mobile         Expo app (rider)
  /vendor-web           Next.js vendor portal (+ /vendor-mobile later)
  /admin-web            Next.js admin console
  /api                  NestJS modular monolith
    /src/modules/<context>/
        <context>.module.ts
        /api            controllers, DTOs (from contracts), guards
        /application    use cases (one file per command or query)
        /domain         entities, value objects, domain events, policies (no framework imports)
        /infrastructure repositories, provider adapters (Paystack, Termii, Maps)
    /src/shared         auth, outbox, idempotency, logging, errors, config
  /workers              BullMQ consumers (dispatch, payouts, notifications)
/packages
  /contracts            Zod schemas, API types, event schemas, enums (single source of truth)
  /sdk                  generated typed API client + React Query hooks
  /design-tokens        colours, type, spacing, radius, motion (JSON → TS, Tailwind, RN)
  /ui-native            React Native design system components
  /ui-web               React web design system components
  /icons                SVG icon set compiled to RN and web components
  /config               eslint, tsconfig, prettier, vitest presets
  /utils                money, time, geo helpers (pure, tested)
/infra                  Terraform, Docker, k6 scripts
/docs                   ARCHITECTURE.md, adr/, runbooks/, event-catalogue.md
/tests                  cross-app end-to-end (Maestro, Playwright)
/.github/workflows      CI/CD
```

Unit tests sit beside the file they test (`*.test.ts`). Cross-app end-to-end tests live in `/tests`. Dependency rule: `domain` imports nothing; `application` imports `domain`; `api` and `infrastructure` import `application`. Apps never import from `apps/api`.

**Bounded contexts**

| Context       | Owns                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| identity      | Users, roles, devices, sessions, OTP, KYC status                                  |
| geo           | Addresses, delivery zones (PostGIS polygons), ETA and distance                    |
| catalog       | Vendors, branches, menus, items, modifiers, availability, opening hours           |
| ordering      | Carts, orders, the order state machine, scheduled orders                          |
| pricing       | Delivery fees, surge, service fees, taxes, promos, referrals                      |
| dispatch      | Rider availability, job offers, assignment, batching, live trips                  |
| payments      | Payment intents, provider webhooks, refunds, wallet, double-entry ledger, payouts |
| notifications | Push, SMS, WhatsApp, email, in-app inbox, templates                               |
| engagement    | Ratings, reviews, favourites, support tickets, chat                               |
| admin         | Audit log, feature flags, ops tooling, reporting views                            |

**Order state machine** (implement as an explicit transition table in `ordering/domain`; reject any other transition)

```text
PENDING_PAYMENT → PLACED → VENDOR_ACCEPTED → PREPARING → READY_FOR_PICKUP
  → RIDER_ASSIGNED → RIDER_AT_VENDOR → PICKED_UP → RIDER_AT_CUSTOMER → DELIVERED
Side exits: PAYMENT_FAILED, VENDOR_REJECTED, CANCELLED_BY_CUSTOMER (only before PREPARING),
            CANCELLED_BY_OPS, UNDELIVERABLE → REFUND_PENDING → REFUNDED
```

Rider assignment runs in parallel with PREPARING, timed so the rider arrives as food is ready. Every transition records actor, timestamp and reason, emits an `order.<state>` event through the outbox, and pushes a WebSocket update.

**Dispatch**

1. When the vendor accepts, schedule a job for `prep_time − rider_travel_time`.
2. Candidates: riders who are online, inside the zone, and within radius R (Redis `GEOSEARCH`), with no active trip or with a batchable trip.
3. Score by estimated pickup time, then acceptance rate, rating, and fairness (time since last job).
4. Offer to one rider at a time with a 20 s timeout; take a Redis lock per order so it is never double-assigned. Widen the radius after N declines, then alert ops for manual dispatch.
5. Keep the algorithm behind a `DispatchStrategy` interface so batching and ML scoring plug in later.

**Money and ledger**

- Store all amounts as integers in minor units (kobo) with a currency code. Use a `Money` value object; never use floats.
- The double-entry ledger is append-only: every movement is two or more entries that sum to zero across accounts (customer wallet, platform, vendor payable, rider payable, provider clearing).
- Payment state changes only from verified provider webhooks or server-side verify calls, never from the client redirect.
- Every write endpoint takes an `Idempotency-Key` header; keys are stored for 24 h. Webhooks are deduplicated by provider event ID.
- Run a nightly reconciliation job against provider settlement reports and alert on mismatches.

**Real-time and offline**

- Riders send location over WebSocket, falling back to batched HTTP. The server writes to Redis GEO and fans out only to that order's room. Persist a downsampled trail for disputes.
- The customer app falls back to polling every 10 s if the socket drops. Every screen shows a clear offline state.
- The rider app queues status actions (picked up, delivered) locally and replays them with idempotency keys when back online.

**Scalability rules**

- Stateless API pods behind a load balancer; scale horizontally.
- Read-heavy catalog endpoints are cached in Redis and at the CDN, with explicit invalidation on menu change.
- Partition hot tables (orders, location trail, ledger) by month once they reach volume. Add read replicas for reporting.
- Extract `dispatch` and `notifications` into their own services first if load requires it.

## SECURITY & COMPLIANCE

The baseline is OWASP ASVS Level 2 for the API and web apps, and OWASP MASVS L1 + R for the mobile apps. Treat money, location and personal data as high-risk by default.

**Identity and sessions**

- Phone number + OTP (6 digits, 5-minute expiry, max 5 attempts, hashed at rest). Add optional passkeys or email later.
- Short-lived access JWT (15 min, asymmetric RS256/EdDSA, rotating signing keys) plus an opaque refresh token. Rotate the refresh token on every use and revoke the whole family if a used token is replayed.
- Bind tokens to a device ID. Store them only in Keychain/Keystore (expo-secure-store), never in AsyncStorage.
- Admin and vendor web: httpOnly, Secure, SameSite cookies, CSRF protection, mandatory 2FA (TOTP) for admin and finance roles.

**Authorization**

- RBAC (customer, rider, vendor\_owner, vendor\_staff, support, ops, finance, super\_admin) plus ownership checks on every resource. A rider sees only their own assigned order; a vendor sees only their own branches.
- Enforce in a guard and again in the use case. Write a test for each IDOR case.
- Admin actions that move money or change roles need a reason and land in an immutable audit log. Large refunds need a second approver.

**Input, transport and API**

- Validate every request with the shared Zod schema; reject unknown fields. Use parameterized queries only.
- TLS 1.2+ everywhere, HSTS, and strict CSP on web. Consider certificate pinning for the payment and auth hosts in the mobile apps, with a pin-rotation plan.
- Rate limit per IP, per user and per phone number (Redis sliding window). OTP sends need extra limits and bot checks, because SMS-pumping fraud is a direct cost.
- Verify provider webhook signatures (Paystack HMAC-SHA512) and accept them only from allowlisted IPs.
- Upload checks: MIME and size checks, image re-encoding, and signed, expiring URLs for private files such as KYC documents.

**Data protection**

- Encrypt at rest (RDS/S3 KMS, AES-256). Field-level encryption for KYC IDs, bank account numbers and exact home addresses.
- Never store card data. Use provider tokenization only, so the system stays in the lightest PCI DSS scope (SAQ A).
- Mask phone numbers between riders and customers; use relay calling and in-app chat.
- Stop sharing rider location with the customer once the order is delivered. Keep the location trail for at most 90 days.
- Comply with the Nigeria Data Protection Act 2023: consent records, a privacy notice, data export and account deletion in-app, a breach-response runbook, and a named data protection officer. Add GDPR when expanding to the EU or UK.
- Never log PII, tokens or OTPs. Use a redaction middleware.

**Secrets and supply chain**

- Secrets come from AWS Secrets Manager or SSM, injected at runtime. Use `.env.example` only for local development; scan with gitleaks in CI.
- Dependabot or Renovate, `pnpm audit`, CodeQL or Semgrep on every PR, signed container images, minimal non-root base images.

**Fraud and abuse**

- Rules engine for promo abuse (device fingerprint + phone + card reuse), fake riders, and collusion (a rider marking delivered far from the drop-off).
- Delivery OTP for high-value orders; GPS sanity checks on rider status changes.
- Root/jailbreak and emulator detection in the rider app, plus mock-location detection.

**Reliability**

- Every external call has timeouts, retries with jittered backoff, and a circuit breaker. Payment falls back to the secondary provider.
- Dead-letter queues for failed jobs, with an admin replay tool.
- Daily backups with point-in-time recovery, restored and tested monthly. Write runbooks for the top 10 incidents.

## DESIGN SYSTEM, UI/UX, ICONOGRAPHY & ONBOARDING

The customer app should feel fast, warm and food-first. The rider app should be glanceable and usable with one hand in the sun. The vendor app should be loud and impossible to miss when an order arrives. Every screen is built only from `packages/ui-native` or `packages/ui-web` components and `packages/design-tokens`; no raw hex values, magic numbers or one-off components.

**Design tokens** (fill in your brand values)

- Colour: `brand.primary` #8CC63F (lime), `brand.ink` #0B0F0A (see docs/07-design-system.md for the full token set), `brand.secondary`, a neutral scale 0–900, and semantic `success`, `warning`, `danger`, `info`. Every text and background pair meets WCAG 2.2 AA (4.5:1 body, 3:1 large text and icons). Ship light and dark themes from day one.
- Type: one variable sans family (e.g. Inter (UI) with Plus Jakarta Sans for headings), a scale of 12/14/16/18/22/28/34, supporting the OS font-size setting up to 200% without clipping.
- Spacing on a 4-pt grid (4, 8, 12, 16, 24, 32, 48). Radius 8 / 12 / 20 / full. Elevation tokens 0–3.
- Motion: 150 ms for micro-interactions, 250 ms for transitions, 400 ms for celebrations; standard ease-out. Respect the OS reduce-motion setting.

**UX rules**

- Every screen defines five states: loading (skeletons, not spinners), empty (illustration + one action), error (plain-language message + retry), offline, and success.
- Touch targets at least 48×48 dp. Primary actions sit in the bottom thumb zone. One primary button per screen.
- Show the full price (items, delivery, service fee, discounts) before the pay button. No hidden fees and no dark patterns.
- Optimistic UI for cart actions; haptics on add-to-cart, order placed and delivered.
- Live tracking screen: map, a 5-step progress bar, ETA in minutes, the rider's name, photo, vehicle and rating, and call or chat buttons.
- Search: recent searches, cuisine chips, typo tolerance, and results in under 300 ms.
- Low-bandwidth mode: smaller images, no autoplay, cached menus. Test on a Tecno / Infinix-class Android phone on a throttled 3G profile.
- Every interactive element has an accessibility label and role; screen-reader order matches visual order.
- Localisation-ready from the start (i18n keys, no hard-coded strings) for English first, then Nigerian Pidgin, Yoruba, Hausa and Igbo. Format currency as ₦ with locale-aware grouping.

**Iconography**

- One icon family across all apps: Phosphor Icons (or Lucide) on a 24×24 grid with a 2 px live area, using 1.5 px stroke (regular) for inactive and filled (fill weight) for active and selected states.
- Sizes only from tokens: 16, 20, 24, 32. Icons inherit `currentColor`.
- Custom category icons (rice dishes, swallow, suya, shawarma, drinks, groceries, pharmacy, parcels) are drawn in the same grid, stroke and corner radius as the base set, so they look like one family.
- Store icons as optimised SVG (SVGO) in `packages/icons`, compiled to typed React and React Native components. Never use PNG icons or icon fonts.
- Icon-only buttons always have an accessibility label. Never rely on colour alone to show state.
- App icon and splash: a simple mark that reads at 29 px, with adaptive Android icon layers and a monochrome variant for themed icons.

**Onboarding**

Customer:

1. Splash → at most 3 swipeable value screens (fast delivery, live tracking, payment options), skippable.
2. Location: a priming screen explains why before the OS prompt. Denied → manual address entry with Places autocomplete and a map pin; never a dead end.
3. Let guests browse vendors and menus. Ask for a phone number only at checkout.
4. Phone + OTP with auto-read (Android SMS Retriever) and a resend timer. Then first name only.
5. Ask for notification permission after the first order is placed, when its value is obvious.
6. A first-order promo and a referral code field, both server-validated.

Rider: phone + OTP → personal details → government ID (NIN) and selfie liveness check through a KYC provider → vehicle and licence documents → guarantor details → bank account (resolved by name through the payment provider) → training module and quiz → pending review, with status shown in-app. Save progress at every step.

Vendor: business details → CAC registration and owner ID → location pin and opening hours → menu import (CSV template or photo-of-menu → draft for ops to review) → bank account → test order walkthrough → go live.

Track each step as a PostHog funnel event (`onboarding_step_viewed`, `onboarding_step_completed`) so drop-off is measurable.

## STANDARDS, TESTING & OUTPUT FORMAT

**Naming**

| Thing                            | Convention                         | Example                                          |
| -------------------------------- | ---------------------------------- | ------------------------------------------------ |
| Files and folders                | kebab-case                         | `restaurant-card.tsx`, `place-order.use-case.ts` |
| React components, classes, types | PascalCase                         | `RestaurantCard`, `OrderStatus`                  |
| Functions, variables, hooks      | camelCase (hooks start with `use`) | `calculateDeliveryFee`, `useCart`                |
| Constants and env vars           | SCREAMING\_SNAKE\_CASE             | `MAX_OTP_ATTEMPTS`                               |
| Database tables and columns      | snake\_case, plural tables         | `order_items.unit_price_minor`                   |
| Domain events                    | `context.entity.past_tense`        | `ordering.order.placed`                          |
| API routes                       | `/v1/` + plural kebab-case nouns   | `POST /v1/orders/{id}/cancel`                    |

**Code**

- ESLint (strict TS rules, import boundaries, jsx-a11y) + Prettier; CI fails on any warning.
- Errors: typed `Result` or domain error classes mapped to RFC 9457 problem+json responses with a stable `code`. Never leak stack traces.
- Structured JSON logs with `traceId`, `userId` (hashed) and `orderId`; no `console.log`.
- Conventional Commits, trunk-based development with short-lived branches, and PRs under about 400 lines.
- Database changes go through reviewed, reversible migrations only, using an expand → migrate → contract pattern for zero downtime.
- API versioning by path (`/v1`); additive changes only within a version.

**Testing**

- Unit: domain logic, pricing, the state machine and `Money` at 90%+ coverage; overall 80%+.
- Integration: each API endpoint against real Postgres and Redis (Testcontainers), including auth and ownership failures.
- Contract: SDK and API stay in sync, checked by OpenAPI diff in CI.
- End-to-end: happy-path order from browse to delivered across customer, vendor and rider (Maestro + Playwright), plus cancel and refund paths.
- Load: k6 scripts for browse, checkout and rider-location fan-out before each major release.
- Each test file follows the Arrange → Act → Assert pattern, and test names state the behaviour, e.g. `rejects cancel after PREPARING`.

**Definition of done**

- [ ] Types, validation, authorization and error handling in place
- [ ] All five UI states, accessibility labels, light and dark themes
- [ ] Tests written and passing; coverage floors met
- [ ] Analytics events and logs added; no PII in either
- [ ] Docs, OpenAPI, event catalogue and ADR updated as needed
- [ ] Feature flag for anything risky; rollback path stated

**Output format**

When creating or changing a file:

````text
📁 [filepath]
Purpose: [one line]
Depends on: [imports]
Used by: [consumers]

```[language]
[fully typed, documented code]
```

Tests: [file path + cases covered]
````

When the architecture needs to change:

```text
⚠️ ARCHITECTURE UPDATE
What: [change]
Why: [reason]
Impact: [consequences, migrations, breaking changes]
ADR: /docs/adr/NNNN-[slug].md
```

End every task with: a summary of what changed, the commands to run (migrate, test, start), open questions, and the suggested next task.

---

**CURRENT TASK:** set per session.

---

## Phase 0 implementation record (2026-11-19)

### Pinned versions

All versions are pinned exactly in `package.json` (`.npmrc` has `save-exact=true`) and were checked with `npm view <pkg> version` before install.

| Area         | Package                                                              | Version                                                                           |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Runtime      | Node.js                                                              | 24.13.1 (engines `>=24`)                                                          |
| Monorepo     | pnpm / turbo                                                         | 11.1.2 / 2.11.13                                                                  |
| Language     | typescript                                                           | 6.0.3 (TS 7.0.2 is `latest`, but typescript-eslint supports `<6.1`; see ADR 0002) |
| Lint/format  | eslint / @eslint/js / typescript-eslint / globals / prettier         | 10.15.0 / 10.0.1 / 8.73.0 / 17.14.0 / 3.10.1                                      |
| Test         | vitest / @vitest/coverage-v8 / supertest / unplugin-swc / @swc/core  | 5.1.1 / 5.1.1 / 7.3.2 / 2.0.0 / 1.16.22                                           |
| Validation   | zod                                                                  | 4.6.7                                                                             |
| Backend      | @nestjs/common, core, platform-express, testing                      | 12.5.1                                                                            |
| Backend      | reflect-metadata / rxjs                                              | 0.2.2 / 7.8.2                                                                     |
| Data         | drizzle-orm / drizzle-kit / pg                                       | 0.45.4 / 0.31.11 / 8.23.1                                                         |
| Cache, jobs  | ioredis / bullmq                                                     | 6.0.0 / 6.7.8                                                                     |
| Auth         | jose                                                                 | 6.2.18                                                                            |
| Logging      | pino                                                                 | 10.4.0                                                                            |
| Web          | next / tailwindcss / @tailwindcss/postcss / postcss                  | 16.4.6 / 4.3.5 / 4.3.5 / 8.5.33                                                   |
| React        | react / react-dom / @types/react                                     | 19.3.0 / 19.3.0 / 19.3.0 (matches Expo SDK 58 bundledNativeModules)               |
| Mobile       | expo / expo-router / expo-status-bar / expo-constants / expo-linking | 58.0.26 / 58.0.32 / 58.0.5 / 58.0.16 / 58.0.17                                    |
| Mobile       | react-native / react-native-svg / safe-area-context / screens        | 0.88.1 / 15.16.0 / 5.11.1 / 4.30.1                                                |
| SDK          | @tanstack/react-query                                                | 5.108.1                                                                           |
| Infra images | postgis/postgis / redis                                              | 16-3.5 / 7.4-alpine                                                               |
| CI           | actions/checkout / actions/setup-node / pnpm/action-setup / gitleaks | v7.0.1 / v7.1.0 / v6.1.1 / v8.30.1                                                |

### Decisions

- ADR 0001 — Drizzle ORM for data access (SQL migrations in `apps/api/drizzle`).
- ADR 0002 — ESM everywhere, TypeScript 6.0, `tsc`-built packages, token/icon code generation, isolated docker-compose project (`delyva`, ports 55432/56379).
- ADR 0003 — Phone OTP + EdDSA access JWT + rotating refresh tokens with reuse detection.

### What exists

- `apps/api`: `src/shared` (Zod-validated env, pino JSON logger with redaction + trace-id mixin, request tracing via `traceparent`/`x-request-id`, RFC 9457 problem+json filter, Zod body pipe, Redis Idempotency-Key interceptor (24 h), Redis sliding-window rate limiter, transactional outbox table + `appendToOutbox` + `SKIP LOCKED` polling publisher, `/healthz`, `/readyz`). `src/modules/identity` with `api/application/domain/infrastructure` layers. OpenAPI 3.1 spec generated from contracts to `apps/api/openapi.json` on build.
- `packages/contracts` is the single source of truth for DTOs, enums, problem and event envelope schemas, and the route registry used to build the OpenAPI document and the SDK.
- Events emitted: `identity.user.registered` (payload `{ userId }`).

### Known technical debt (Phase 0)

- DEBT(identity): single JWT signing key; JWKS rotation with previous keys not implemented.
- DEBT(platform): helmet/CORS/`trust proxy` not configured; per-IP limits need the real client IP behind the LB.
- DEBT(observability): OpenTelemetry traces/metrics not wired (trace ids are propagated and logged only); Sentry not added.
- DEBT(outbox): logging event bus; NATS JetStream adapter and LISTEN/NOTIFY wake-ups pending.
- DEBT(notifications): Termii adapter has a timeout but no retry/circuit breaker or WhatsApp fallback.
- DEBT(data): Drizzle has no down migrations; reversibility relies on expand/contract.
- DEBT(security): no bot check (captcha/attestation) on OTP send yet; no RBAC guard yet (no protected routes exist).
- DEBT(mobile): customer bundle is ~2.6 MB Hermes bytecode before any feature work (NFR target < 2 MB initial JS); tokens not yet stored via expo-secure-store (no auth screen yet).
- DEBT(web): CSP/HSTS headers not configured; i18n not set up (hard-coded English in scaffolds).
- DEBT(test): SDK hooks and RN `Button` lack render tests (need React/RN testing libraries); no Testcontainers yet (integration tests use the docker-compose services and skip with a message when unreachable).
- DEBT(icons): icons are hand-optimised SVG; SVGO pipeline and Phosphor import not added.

## Phase 1 — catalog & geo (2026-11-20)

### What exists

- `apps/api/src/modules/geo`: customer addresses (`addresses`, PostGIS `geometry(Point,4326)`), Lagos delivery zones (`delivery_zones`, `geometry(Polygon,4326)` + GiST), `GeoService` public interface (`zonesContaining`, `travel`, `deliveryEstimate`), `EtaProvider` (haversine × road factor default; Google Distance Matrix adapter stub behind `ETA_PROVIDER=google`).
- `apps/api/src/modules/catalog`: vendors (category restaurant/grocery/pharmacy/bakery/shop; status draft → in_review → live ↔ suspended, explicit transition table), `vendor_members` (owner/staff), branches (point + `zone_id`, prep minutes), weekly opening hours in Africa/Lagos (overnight intervals supported, overlaps rejected), menus → categories → items (integer kobo, validated through `Money`), modifier groups (min/max) and options (kobo deltas), availability toggles. `validateSelection` (modifier min/max/unknown/unavailable + kobo delta sum) is ready for ordering's cart re-pricing.
- `apps/api/src/shared/auth/ownership.guard.ts` (new): `OwnershipGuard` + `@OwnsResource` + `OwnershipChecker` port, used after the shared `AuthGuard`/`@Roles`/`@Principal` from ADR 0200 (geo and catalog provide `ACCESS_TOKEN_VERIFIER` from identity's signer key, like pricing). `src/shared/validation/zod-query.pipe.ts` for strict query validation.
- Migration `apps/api/drizzle/0100_catalog_geo.sql`; dev seed `pnpm --filter @delyva/api db:seed:catalog` (after build + migrate): 4 approximate Lagos zones (VI, Ikoyi, Lekki, Yaba), 8 vendors with Nigerian menus (one `in_review`), demo vendor owner `+2348000000001` (sign in via dev OTP).

### Endpoints (v1)

| Method        | Path                                                              | Auth                                                                                                                                            |
| ------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| GET           | `/v1/vendors?lat=&lng=&category=`                                 | public; only live + open-now vendors with a branch whose zone covers the point; `distanceMeters`, `etaMinutes`, `deliveryFee: null` placeholder |
| GET           | `/v1/vendors/{vendorId}`                                          | public; live vendors only, branches with `isOpenNow`, full menu                                                                                 |
| POST          | `/v1/vendors/{vendorId}/items`                                    | vendor_owner (member owner)                                                                                                                     |
| PATCH         | `/v1/vendors/{vendorId}/items/{itemId}`                           | vendor_owner                                                                                                                                    |
| PUT           | `/v1/vendors/{vendorId}/items/{itemId}/availability`              | vendor_owner / vendor_staff                                                                                                                     |
| PUT           | `/v1/vendors/{vendorId}/modifier-options/{optionId}/availability` | vendor_owner / vendor_staff                                                                                                                     |
| POST          | `/v1/vendors/{vendorId}/items/{itemId}/modifier-groups`           | vendor_owner                                                                                                                                    |
| PUT           | `/v1/vendors/{vendorId}/branches/{branchId}/opening-hours`        | vendor_owner                                                                                                                                    |
| POST          | `/v1/vendors/{vendorId}/go-live`                                  | ops / super_admin                                                                                                                               |
| GET, POST     | `/v1/addresses`                                                   | customer                                                                                                                                        |
| PATCH, DELETE | `/v1/addresses/{addressId}`                                       | customer (own only; foreign ids 404)                                                                                                            |

All writes require `Idempotency-Key`. Contracts: `packages/contracts/src/{geo,catalog}/`; SDK methods in `packages/sdk/src/client.ts`, hooks in `packages/sdk/src/catalog-hooks.ts`.

### Events

- `catalog.vendor.went_live` `{ vendorId }` — on transition to live.
- `catalog.item.availability_changed` `{ vendorId, itemId, optionId | null, available }` — item or modifier option toggle.

### Decisions

- ADR 0100 — shared RBAC/ownership guards, geo ↔ catalog boundary via `GeoService`, ETA provider, 0100 migration naming.

### Known technical debt (catalog & geo)

- DEBT(pricing): `deliveryFee` is `null` until discovery calls pricing; pricing keys fee rules by `zoneCode` (`lagos`) while geo zones are uuids with `city = Lagos` — agree a mapping (zone code column on `delivery_zones`) before wiring.
- DEBT(catalog): discovery not cached in Redis/CDN; no pagination beyond a 50-vendor cap; no search (Meilisearch).
- DEBT(security): address `line1`/`landmark` stored plaintext (field-level encryption required); idempotency keys are scoped per path, not per user.
- DEBT(admin): vendor approval has no reason/audit-log entry yet.
- DEBT(geo): ETA heuristic constants uncalibrated; Google adapter untested, no breaker/cache, one call per branch.
- DEBT(data): zone polygons are rough rectangles; drizzle snapshot for 0100 records SRID-less point type (SQL hand-corrected to 4326).
- DEBT(sdk): catalog hooks have no render tests (same as Phase 0 hooks).

## Pricing (Phase 1, 2026-11-19)

Bounded context `apps/api/src/modules/pricing` (`api/application/domain/infrastructure`). See ADR 0200.

- **Public interface:** `PricingService.quote({ userId, zoneCode, pickup, dropoff, lines, promoCode? })` returns an itemised `PriceQuote` in `Money` (kobo). `RedeemPromo.execute({ code, userId, orderId, itemsSubtotalMinor, discountMinor })` records a redemption once per (promo, order). Both are exported by `PricingModule` for ordering.
- **Endpoints:** `POST /v1/quotes` (any authenticated user), `GET/POST/PATCH /v1/admin/fee-rules`, `/v1/admin/surge-rules`, `/v1/admin/promos` (roles `ops`, `super_admin`; POSTs need `Idempotency-Key`). New problem codes: `zone_not_serviceable` (422), `promo_ineligible` (422).
- **Calculation order (pure domain, integer kobo, basis points):**
  1. Items subtotal = Σ quantity × (unit + Σ modifier deltas); a negative unit price is rejected.
  2. Delivery fee = base fee (covers `baseDistanceMeters`) + per **started** km beyond it, each km priced by the tier it starts in; clamped to `[minFee, maxFee]`. Distance = straight-line haversine rounded **up** to the metre; beyond `maxDistanceMeters` → `zone_not_serviceable`.
  3. Surge = highest matching rule for the zone and Lagos-local (UTC+1) weekday/minute window `[start, end)`, never compounding, capped at `maxSurgeBps`; a separate `surgeFee` line on the delivery fee.
  4. Small-order fee when subtotal < threshold. Service fee = subtotal × bps, capped.
  5. Promo discount: `free_delivery` = delivery + surge; `percent_off` = floor(subtotal × bps), capped; `fixed_off` = value; item discounts never exceed the subtotal; then clamped to the promo's remaining budget.
  6. VAT (`vatBps`, 750 for Lagos; 0 disables) on platform fees only (delivery + surge + small-order + service − free-delivery discount); menu prices are VAT-inclusive.
  7. `total = subtotal + fees + VAT − discount` (never negative).
- **Rounding:** charges (fees, surge, VAT) round half-up to the kobo; percentage discounts round down. `amount × bps` uses BigInt.
- **Promo eligibility** (fixed order, server-side only): active → window → weekday → audience (`new_users`) → min order → per-user limit → global limit → budget. A quote returns `promo.applied=false` with a `reason` instead of failing.
- **Redemption concurrency:** `SELECT … FOR UPDATE` on the promo row, eligibility re-checked under the lock, `UNIQUE(promo_id, order_id)` for idempotency, `CHECK`s `spent_minor <= budget_minor` and `redemption_count <= global_limit`. Emits `pricing.promo.redeemed` (`{ redemptionId, promoId, code, userId, orderId, discountMinor }`) via the outbox in the same transaction.
- **Storage:** migration `0200_pricing` (`fee_rules` one per zone with JSONB tiers, `surge_rules`, `promos`, `promo_redemptions`). Idempotent seed that never overwrites admin edits: `pnpm --filter @delyva/api db:seed:pricing`. Lagos: ₦300 within 3 km, then ₦100/₦150/₦200 per km (to 8 km / 15 km / beyond), ₦300–₦3,500, max 25 km, small-order ₦200 under ₦2,000, service 5 % cap ₦500, VAT 7.5 %, surge cap 1.5x (weekday 12–14h 1.2x, 18–21h 1.3x). Promos `TUNDE50` (₦500 off, new users, once) and `WEEKEND` (free delivery Sat/Sun, min ₦3,000).
- **Auth:** generic `src/shared/auth` (`AuthGuard`, `@Roles`, `@Principal`, `JoseAccessTokenVerifier`); a module provides `ACCESS_TOKEN_VERIFIER` (pricing builds it from identity's exported signer key).

### Known technical debt (pricing)

- DEBT(pricing): `/v1/quotes` trusts client unit prices until the catalog context exists; ordering must re-quote with catalog prices before charging.
- DEBT(pricing): zone is a client-supplied `zoneCode`; resolve from coordinates with PostGIS when geo lands. Distance is straight-line, not road distance.
- DEBT(pricing): "new customer" = no prior promo redemption; switch to ordering's delivered-order count.
- DEBT(pricing): quotes are not persisted/signed; checkout should reference a short-lived server-side quote id.
- DEBT(pricing): no admin audit log for config changes; no weather/demand surge; no SDK methods for surge-rule admin.
