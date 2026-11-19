# Delyva — Delivered Your Way.

Electric, solar-powered delivery and commerce platform for Nigeria (food, groceries, parcels, merchant logistics).
This repo holds the **complete product documentation** and the **clickable UI design screens** for all four apps.

> Source of truth for business context: *Electric Delivery Platform — Business Proposal.pdf* (Nigeria, e-motorcycles, solar hubs, ₦300 starting fee, merchant-first onboarding).

## Documentation map

| # | Doc | What it answers |
|---|-----|-----------------|
| 01 | [Product & Business](docs/01-product-and-business.md) | Vision, personas, services, pricing, commissions, unit economics, Nigeria specifics |
| 02 | [System Flows & Workflows](docs/02-system-flows.md) | Every end-to-end flow: onboarding → order → dispatch → tracking → payment → settlement → support |
| 03 | [System Architecture](docs/03-architecture.md) | Services, stack, realtime, dispatch engine, payments, maps, notifications, infra, security |
| 04 | [Data Model & API](docs/04-data-and-api.md) | ERD/tables, REST + WebSocket contracts, events, state machines |
| 05 | [Features by App](docs/05-features-by-app.md) | Customer, Merchant, Rider, Admin feature lists with MVP / V2 / V3 tags |
| 06 | [Delivery Pipeline & Roadmap](docs/06-delivery-pipeline.md) | How to build it start→finish: team, sprints, CI/CD, QA, release, launch plan |
| 07 | [Design System](docs/07-design-system.md) | Tokens, color, type, spacing, glass, components, breakpoints, motion, a11y |
| 08 | [Screen Inventory & UX](docs/08-screens-and-ux.md) | Every screen, state, flow, empty/error handling per app |

## Design screens (open in a browser)

Start at [`design/index.html`](design/index.html).

| File | Contents |
|------|----------|
| `design/index.html` | Gallery + navigation to everything |
| `design/design-system.html` | Live tokens, components, breakpoints |
| `design/customer.html` | Customer app — onboarding → home → cart → payment → live tracking → rating → profile |
| `design/merchant.html` | Merchant app — onboarding, orders, menu, earnings, delivery-only requests |
| `design/rider.html` | Rider app — onboarding, shift, offers, navigation, proof of delivery, earnings, battery |
| `design/admin.html` | Operations dashboard (desktop) — live map, dispatch, merchants, riders, finance, fleet/solar |

Shared styling lives in `design/assets/delyva.css` (all tokens as CSS variables).

## Brand

- **Name:** Delyva — short, international, easy to say; room to grow beyond logistics.
- **Tagline:** Delivered Your Way.
- **Promise:** Fast. Affordable. Reliable.
- **Look:** soft lime-green + near-black ink, off-white surfaces, glassmorphism cards, big rounded corners, food/product photography first.

## Running locally

Prerequisites: Node.js 24, pnpm 11, Docker Desktop.

```bash
pnpm install

# Postgres 16 + PostGIS and Redis 7 (compose project "delyva", ports 55432 / 56379 on 127.0.0.1).
# Override ports in infra/.env (see infra/.env.example).
docker compose -f infra/docker-compose.yml up -d

# API environment (local development values only; never commit .env)
cp apps/api/.env.example apps/api/.env      # set HASH_PEPPER to a random 64-hex string

pnpm build                                  # builds packages, apps and writes apps/api/openapi.json
pnpm --filter @delyva/api db:migrate        # applies SQL migrations
pnpm --filter @delyva/api start             # http://localhost:3300 (/healthz, /readyz)
```

With `SMS_PROVIDER=dev`, the latest OTP for a phone is stored in Redis (never logged):

```bash
docker exec delyva-redis-1 redis-cli GET "dev:otp:+2348031234567"
```

Other apps: `pnpm --filter @delyva/vendor-web dev` (port 3301), `pnpm --filter @delyva/admin-web dev` (3302),
`pnpm --filter @delyva/customer-mobile dev` / `@delyva/rider-mobile dev` (Expo), `pnpm --filter @delyva/workers dev`.

Quality gates (same as CI): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format`.
API integration tests use the docker-compose services (database `delyva_test`, Redis db 15) and are skipped
with a message if those services are not reachable.
