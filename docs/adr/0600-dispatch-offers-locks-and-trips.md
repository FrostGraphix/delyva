# ADR 0600 — Dispatch: one-at-a-time offers, per-order Redis lock, trips via an ordering port

- Status: accepted (2026-11-20)
- Context: Phase 1 needs auto dispatch (ARCHITECTURE "Dispatch") plus manual override, built in parallel with the ordering context.

## Decision

1. **Module** `apps/api/src/modules/dispatch` owns `rider_profiles`, `dispatch_requests`, `dispatch_offers`, `trips`, `dispatch_event_receipts` (migration `0600_dispatch.sql`). Other contexts are referenced by uuid only (no cross-context FKs).
2. **Trigger:** an outbox consumer (same receipt-claim pattern as notifications) reads `ordering.order.vendor_accepted` and schedules a BullMQ delayed `start` job at `readyAt − travel`, where travel = nearest rider within the widest radius ÷ `DISPATCH_RIDER_SPEED_MPS` (or `DISPATCH_DEFAULT_TRAVEL_SECONDS`).
3. **Rounds:** candidates = `LIVE_TRACKING.ridersNear` ∩ `rider_profiles.status = online` minus riders already offered this order or holding another pending offer, filtered to riders inside a geo zone that also contains the pickup (skipped when the pickup has no zone). Ranking is behind `DispatchStrategy`; the default `EtaFirstStrategy` sorts by pickup ETA (minute buckets), acceptance rate, rating, then fairness (longest idle first).
4. **One offer at a time:** a partial unique index allows one `pending` offer per order and per rider. Each offer schedules a `timeout_<offerId>` job (`DISPATCH_OFFER_TIMEOUT_MS`, default 20 s). Decline/timeout → `next_<offerId>` job. Every `DISPATCH_DECLINES_BEFORE_WIDEN` declines/timeouts widens to the next of `DISPATCH_RADII_M`; no candidates in the widest radius or `DISPATCH_MAX_OFFERS` reached → `dispatch.order.unassigned` (ops manual dispatch).
5. **Never double-assigned:** every assignment path (accept, ops override, rounds, timeouts, trip actions) runs under `SET dispatch:lock:<orderId> NX PX` with compare-and-delete release; partial unique indexes on active trips per order and per rider are the backstop.
6. **Ordering coupling:** dispatch calls `OrderFulfilmentPort` (DI token `ORDER_FULFILMENT_PORT`) inside the assignment transaction. Until ordering merges, the port interface and event schema are a local `TEMP(ordering-contract)` copy and the binding is an in-memory double.
7. **Trip actions** follow an explicit transition table, delegate to the port, and pass a GPS sanity check (`DISPATCH_GPS_MAX_DISTANCE_M`, problem code `rider_too_far`). Offline replays: `Idempotency-Key` replays return the stored response; an already-applied action under a new key is a no-op success; the device fix recorded at action time is used when the server already holds a fix ≥ 15 s newer and the device fix is ≤ 30 min old.
8. **Offer delivery:** Socket.IO `dispatch:offer` to room `rider:<id>` (new `SocketRoomBroadcaster.dispatchOffer`, exported by RealtimeModule) plus push via `NotifyUser` template `rider.dispatch_offer`.
9. The BullMQ worker runs in the API process for now (it needs DB, lock and socket broadcaster).

## Consequences

- New problem codes: `rider_too_far` (422), `offer_unavailable`, `order_already_assigned`, `rider_unavailable` (409).
- `DispatchModule.forRoot({ realtime })` must receive the same RealtimeModule reference the app imports so only one gateway/broadcaster exists.
- Ordering's `markRiderAssigned` must be idempotent per (order, rider); a commit failure after the port call is a known gap (DEBT).
