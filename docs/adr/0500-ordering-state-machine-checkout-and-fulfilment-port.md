# ADR 0500 — Ordering: state machine, checkout and the fulfilment port

- Status: accepted
- Date: 2026-11-20

## Context

Phase 1 needs customer ordering on top of identity, catalog/geo, pricing, payments and realtime.
Ordering must never trust client prices, must reserve money atomically with order creation, and
must expose rider-side transitions to the dispatch context (built in parallel) without coupling.

## Decisions

1. **Explicit transition table** in `ordering/domain/order-state-machine.ts`, exactly the
   ARCHITECTURE machine. CANCELLED_BY_CUSTOMER only from PENDING_PAYMENT / PLACED /
   VENDOR_ACCEPTED; CANCELLED_BY_OPS from any active state; UNDELIVERABLE from PICKED_UP or
   RIDER_AT_CUSTOMER; VENDOR_REJECTED / CANCELLED_* / UNDELIVERABLE → REFUND_PENDING → REFUNDED.
   An actor table restricts who may enter each state. Every transition writes a
   `order_status_history` row (actor, time, reason) and an `ordering.order.<state>` outbox event in
   the same transaction, then pushes `LIVE_TRACKING.publishOrderStatus` after commit.
2. **Rider assignment in parallel with PREPARING** without bending the table: dispatch may call
   `markRiderAssigned` from VENDOR_ACCEPTED/PREPARING; the rider is bound (`rider_id`) and the
   status becomes RIDER_ASSIGNED as soon as the vendor marks READY_FOR_PICKUP (same transaction).
3. **Checkout** (`POST /v1/orders`, Idempotency-Key required + `UNIQUE(customer_id,
   idempotency_key)` as a second line of defence): cart lines are re-priced through the new public
   `CatalogService` (`validateSelection`), then `PricingService.quote`. One transaction inserts the
   order, items, history and event, redeems the promo through pricing's new
   `TransactionalRedeemPromo` (a SAVEPOINT of the order transaction, so the redemption is atomic
   with the order) and deletes the cart. Wallet: `PaymentsService.createIntentForOrder` (hold) runs
   inside that window and the order goes PLACED in the same transaction; insufficient funds roll
   everything back. Card/transfer: the provider intent is created after commit; the order stays
   PENDING_PAYMENT until a `payments.intent.succeeded` outbox event (receipt-table consumer) moves
   it to PLACED (`failed` → PAYMENT_FAILED; a late success for a closed order releases the hold).
4. **Pricing zone mapping (fixes the catalog/pricing DEBT):** the pricing zone code is the
   lower-cased city of the geo delivery zone that contains the drop-off and is the branch's zone
   (`Lagos` → `lagos`). `GeoService` gained `zonesAt(point)` (id, city, name) and
   `addressOf(userId, addressId)`.
5. **Money:** capture happens only at DELIVERED via `captureOrderSplit` with
   vendor = items − commission (`ORDERING_VENDOR_COMMISSION_BPS`, default 0),
   rider = floor((delivery + surge) × `ORDERING_RIDER_DELIVERY_SHARE_BPS`, default 80 %),
   platform = commission + service + small-order + remaining delivery, tax = VAT,
   promo = discount. Before capture every refund path is a **hold release** (funds return to the
   customer's wallet).
6. **Codes:** the 4-digit delivery OTP and pickup code are HMAC-derived from `HASH_PEPPER` and the
   order id; only a second HMAC is stored, verified in constant time. The customer sees the OTP,
   vendors/ops the pickup code.
7. **Vendor timeout:** BullMQ delayed job per PLACED order (`jobId = orderId`, delay
   `ORDERING_AUTO_REJECT_SECONDS`) → VENDOR_REJECTED (system, `vendor_timeout`) → refund.
8. **Dispatch port:** `OrderFulfilmentPort` + `ORDER_FULFILMENT_PORT` (string DI token) and the
   `ordering.order.vendor_accepted` payload schema live in `packages/contracts/src/ordering`.
   Only the assigned rider may move an order; replays are idempotent.
9. **Realtime authorizer:** `OrderRoomAccess` (customer, assigned rider, vendor members) is
   registered by the composition root on the realtime module; `OrderingModule.register(realtime)`
   imports that same module instance so the gateway exists once.

## Consequences

- Cancelled card orders are refunded to the wallet, not to the card (see DEBT).
- The order transaction is held open during the wallet hold call (DB only, fast).
- Migration `0500_ordering.sql` is last in the journal; its snapshot holds the full schema.
