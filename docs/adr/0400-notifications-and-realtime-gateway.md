# ADR 0400 — Notifications delivery pipeline and Socket.IO realtime gateway

- Status: accepted
- Date: 2026-11-20
- Context: Phase 1 needs push/SMS/in-app notifications driven by domain events, and live rider tracking over WebSockets with an HTTP fallback.

## Decision

### Notifications

1. **Templates are data + i18n keys.** `notifications/domain/templates.ts` declares each template (category, channels, required params, mandatory flag); copy lives in a flat catalogue `notifications.<template>.<title|body|text>` per locale (`en` now; `pcm`, `yo`, `ha`, `ig` fall back to English key by key). Rendering is pure and fails on missing params.
2. **Preferences** are overrides on a category × channel matrix with defaults (push + in-app on; SMS/WhatsApp and promotional push opt-in because they cost money / need consent). Only `mandatory` templates bypass opt-outs.
3. **Independent outbox consumer.** The notifications context polls `outbox_events` for the event types it consumes and claims each by inserting a row into `notification_event_receipts` (PK = event id) in a transaction. This keeps the shared `OutboxPublisher`/`EventBus` untouched and gives exactly-once *claiming* per event; delivery is at-least-once with dedupe (`notifications(user_id, dedupe_key)` unique; BullMQ `jobId = <event>_<user>_<channel>`). Replace with a NATS JetStream durable consumer when the broker lands.
4. **Delivery runs in `apps/workers`** on BullMQ queue `notifications` (5 attempts, custom full-jitter exponential backoff, base 2 s, cap 5 min). Invalid payloads and permanent provider errors (`DeviceNotRegistered`, 4xx) become `UnrecoverableError`; every terminal failure is copied to `notifications-dlq` (`DeadLetterJob` in contracts) for inspection/replay. Job payloads are rendered by the API, so workers need no DB access.
5. **Providers:** Expo Push Service over its HTTP API (no `expo-server-sdk` dependency needed), Termii for transactional SMS (generic text adapter; identity's OTP adapter is OTP-specific and lives in `apps/api`, which workers cannot import), WhatsApp adapter stub (fails permanently → DLQ). `log` channels for development.
6. **Devices** are `push_devices` keyed by (user, device id). The device id is taken from the access token's `did` claim, never the body; a token re-registered elsewhere is detached from its previous owner. (Identity owns sessions/devices; this table only stores push tokens and is owned by notifications.)

### Realtime

1. **`@nestjs/websockets` 12.5.1 + `@nestjs/platform-socket.io` 12.5.1 are compatible with NestJS 12** (peer `@nestjs/core ^12`, bundles `socket.io` 4.8.4), so the gateway is a Nest `@WebSocketGateway` on the HTTP server. A custom `RedisIoAdapter` (extends `IoAdapter`) installs `@socket.io/redis-adapter` 8.3.0 (peer `socket.io-adapter ^2.5.4`; works with ioredis 6.0.0, verified by integration test) with dedicated pub/sub connections, so room emits fan out across API pods.
2. **Auth on handshake:** `auth.token` (or `Authorization: Bearer`) is verified with the shared `ACCESS_TOKEN_VERIFIER` (`JoseAccessTokenVerifier`, same as HTTP); failures reject the connection with `unauthorized`.
3. **Rooms:** `order:<id>` and `rider:<id>`. Riders auto-join their own room. Joining an order room requires ops/support/super_admin or approval by the `OrderRoomAuthorizer` port; the shipped `DenyByDefaultOrderRoomAuthorizer` denies everyone else. Ordering supplies its implementation via `RealtimeModule.withAuthorizer(...)` (tests use `InMemoryOrderRoomAuthorizer`).
4. **Location ingestion:** `rider:location` `{lat,lng,heading,ts}` validated by the contracts schema, freshness-checked (≤ 5 min old, ≤ 30 s in the future), rate limited (5 / 10 s per rider over WS; 12 batches / min over HTTP `POST /v1/riders/me/locations`, ≤ 50 points), newest fix written with `GEOADD riders:locations` plus a last-fix hash that also rejects out-of-order fixes, and broadcast only to the rider's active order room (`rider:<id>:active_order`, set by dispatch through `LiveTrackingService.startTrip`).
5. **`LiveTrackingService`** (`LIVE_TRACKING` token, exported) is the public interface for dispatch/ordering: `ingest`, `positionOf`, `ridersNear` (GEOSEARCH), `startTrip`, `endTrip`, `publishOrderStatus`.

## Dependencies added

| Package | Version | Licence | Why / cost |
| --- | --- | --- | --- |
| socket.io | 4.8.4 | MIT | WebSocket server (API runtime only) |
| @socket.io/redis-adapter | 8.3.0 | MIT | Cross-pod room fan-out; 2 extra Redis connections per pod |
| @nestjs/websockets, @nestjs/platform-socket.io | 12.5.1 | MIT | Nest gateway integration |
| bullmq (api) | 6.7.8 | MIT | Producer side of the existing worker queue |
| socket.io-client | 4.8.4 | MIT | SDK realtime helper (~ 14 kB gz in apps); API dev dependency for tests |
| ioredis (workers, dev) | 6.0.0 | MIT | Worker integration test cleanup |

## Consequences

- Phones are copied into SMS job data in Redis (PII) until workers can resolve them — DEBT.
- Polling the shared outbox with `NOT EXISTS` is fine at launch volume; it needs an index or a broker consumer at scale.
- No downsampled location trail yet; Redis holds only the latest fix.
