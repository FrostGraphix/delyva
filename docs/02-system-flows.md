# 02 · System Flows & Workflows (end to end)

Actors: **C** Customer · **M** Merchant · **R** Rider · **O** Ops/Admin · **S** System (backend) · **P** Payment provider · **N** Notification channels (push/SMS/WhatsApp/email).

## 0. Big picture

```mermaid
flowchart LR
  subgraph Clients
    CA[Customer App]
    MA[Merchant App / Web]
    RA[Rider App]
    AD[Admin Dashboard]
  end
  GW[API Gateway + Auth]
  CA & MA & RA & AD --> GW
  GW --> CAT[Catalog] & ORD[Orders] & PAY[Payments] & DSP[Dispatch] & TRK[Tracking] & USR[Identity/KYC] & NTF[Notifications] & PRC[Pricing/Promo] & FIN[Settlement] & SUP[Support]
  PAY <--> P[(Paystack / Flutterwave)]
  DSP --> TRK
  TRK -- WebSocket --> CA & MA & AD
  NTF --> N[(FCM · APNs · SMS · WhatsApp · Email)]
```

## 1. Onboarding flows

### 1.1 Customer onboarding

```mermaid
flowchart TD
  A[Install / open] --> B[Splash + 3 value slides]
  B --> C[Enter phone]
  C --> D[SMS OTP / WhatsApp OTP]
  D -->|valid| E{New user?}
  E -->|yes| F[Name + optional email + referral code]
  E -->|no| H
  F --> G[Location permission → pick/confirm address pin]
  G --> H[Home]
  D -->|invalid x5| X[Cooldown + support link]
```

Rules: phone is identity; OTP 6 digits, 5-min TTL, 5 attempts, resend after 30 s; device fingerprint stored; guest browsing allowed, login required at checkout.

### 1.2 Merchant onboarding (matches proposal's 5 steps)

```mermaid
flowchart TD
  S1[1 Direct outreach: Bashir/Agent visit, call, WhatsApp] --> S2[2 Fast registration via link or QR ~5 min]
  S2 --> S2a[Business name, category, address pin, hours, contact]
  S2a --> S2b[Owner ID + bank/payout account verification]
  S2b --> S3[3 Assisted upload: menu by WhatsApp / photo / spreadsheet]
  S3 --> S3a[Delyva catalogue team digitises items, photos, prices]
  S3a --> S4[4 Verification + storefront setup + TEST ORDER]
  S4 -->|pass| LIVE[Store goes LIVE - status Active]
  S4 -->|fail| FIX[Back to merchant with checklist]
  LIVE --> S5[5 Ongoing support: contact, first-order help, training]
```

States: `draft → submitted → in_review → approved → test_order → live` (also `suspended`, `rejected`). Tiering: micro-vendor (ID + bank only) vs registered business (CAC + food-safety cert where required).

### 1.3 Rider onboarding

```mermaid
flowchart TD
  A[Sign-up phone + OTP] --> B[Personal details + photo selfie liveness]
  B --> C[NIN/BVN check + driver licence + guarantor form]
  C --> D[Bank account verification]
  D --> E[Background / reference check by Ops]
  E --> F[Training module + quiz: safety, e-bike, app, POD]
  F --> G[Hub assignment + bike allocation + uniform/box]
  G --> H[Approved → Go online]
```

States: `applied → docs_pending → under_review → training → approved → active` (+ `suspended`, `offboarded`).

### 1.4 Admin / ops onboarding

Super-admin invites by email → SSO/2FA required → role assigned (Ops, Support, Finance, Catalogue, Fleet, Super) → audit logging on every action.

## 2. Order lifecycle (master flow)

```mermaid
sequenceDiagram
  autonumber
  participant C as Customer
  participant S as Backend
  participant P as Paystack
  participant M as Merchant
  participant D as Dispatch
  participant R as Rider
  C->>S: Browse → build cart
  C->>S: POST /quotes (items, address)
  S-->>C: Price breakdown: items + delivery fee + service fee − promo
  C->>S: POST /orders (payment_method)
  S->>P: Init transaction / virtual account
  P-->>C: Card/transfer/USSD page
  P->>S: Webhook charge.success
  S->>M: New order (push + sound + WebSocket)
  M->>S: Accept (set prep time) / Reject
  S->>D: Order ready-soon → find rider
  D->>R: Offer (30 s window)
  R->>S: Accept
  S-->>C: "Rider assigned" + live tracking
  R->>S: Arrived at store
  M->>S: Mark Ready / hand over (pickup code)
  R->>S: Picked up (scan / code)
  R-->>S: GPS pings every 3–5 s
  S-->>C: Live location + ETA
  R->>S: Arrived at customer
  C-->>R: Delivery OTP (or photo proof)
  R->>S: Delivered
  S->>C: Rate order + receipt
  S->>S: Ledger entries → settlement
```

### 2.1 Order state machine

```
created ─► awaiting_payment ─► paid ─► merchant_pending ─► accepted ─► preparing ─► ready_for_pickup
   │              │               │            │                                        │
   ▼              ▼               ▼            ▼                                        ▼
cancelled      expired        refunded     rejected(→refund)           rider_assigned ─► rider_at_store ─► picked_up
                                                                                                             │
                                                              failed_delivery ◄─ at_customer ◄─ in_transit ◄─┘
                                                                     │                │
                                                                     ▼                ▼
                                                              returned_to_merchant  delivered ─► completed
```

Timeouts: merchant must accept in **3 min** (auto-reject → re-offer/refund); payment 15 min; rider offer 30 s, ×3 then widen radius; customer no-show wait 5 min → call → failed_delivery policy.

### 2.2 Order types

| Type                     | Difference                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Food                     | Merchant accept + prep time, hot-food SLA, batching only if same-direction & <5 min detour                                                               |
| Grocery                  | Substitutions flow (customer approves swaps), weight/size surcharge                                                                                      |
| Parcel                   | No merchant. Sender enters pickup + drop, package size/value/category (permitted-items check), pickup OTP + delivery OTP, optional insurance             |
| Delivery-only (merchant) | Merchant books rider for off-platform order; customer gets tracking link by SMS/WhatsApp, no app required; merchant pays fee from wallet or per-delivery |

## 3. Payment flows

```mermaid
flowchart TD
  A[Checkout] --> B{Method}
  B -->|Card| C[Paystack inline 3DS]
  B -->|Bank transfer| D[Dynamic virtual account, 30-min expiry]
  B -->|USSD| E[Bank USSD code]
  B -->|Wallet| F[Debit Delyva wallet]
  B -->|Cash on delivery| G[Limited: trusted users, cap ₦15k; rider remits]
  C & D & E --> H[Webhook charge.success - verified by signature + re-verify API]
  H --> I[Order = paid]
  F --> I
  G --> I2[Order = paid_cod; rider cash ledger]
```

Safety: idempotency keys, webhook signature verification, amount re-check, duplicate-webhook safe, reconciliation job every 15 min.

### 3.1 Ledger (double-entry)

On `delivered`:

```
Customer pays 7,150   =  items 6,000 + delivery 450 + service 100 + VAT/other 600(if any)
 Dr  Paystack clearing         7,150
   Cr Merchant payable          5,280   (6,000 − 12% commission)
   Cr Rider payable               300
   Cr Delyva revenue (commission)  720
   Cr Delyva revenue (delivery margin) 150
   Cr Delyva revenue (service fee)  100
   Cr Tax payable                 600
```

Every money movement is a ledger entry (immutable); balances are derived.

### 3.2 Settlement

- **Merchant:** daily T+1 or weekly; statement PDF; negative balance carry-forward for refunds.
- **Rider:** instant cash-out (fee) or weekly free; COD remittance netted off.
- Payout via Paystack Transfers / Flutterwave Disburse; failed transfer → retry → ops queue.

## 4. Dispatch flow

```mermaid
flowchart TD
  A[Order accepted + prep ETA] --> B[Compute pickup-time = now + prep − rider travel]
  B --> C[Candidate riders: online, battery ≥ trip need + 15 %, within radius, capacity free]
  C --> D[Score = ETA to store·0.4 + idle time·0.2 + rating·0.1 + battery fit·0.1 + batching gain·0.2]
  D --> E[Offer to top rider 30 s]
  E -->|accept| F[Assigned]
  E -->|decline/timeout| G{attempts<3?}
  G -->|yes| E
  G -->|no| H[Widen radius + surge bonus + ops alert]
  F --> I[Batch check: same pickup or ≤1.5 km detour → add order]
```

Ops can **manual-assign / reassign** from admin map at any state.

## 5. Tracking flow

- Rider app sends `location` every 3–5 s (adaptive; batches offline, replays on reconnect).
- Backend → Redis geo index → WebSocket channel `order:{id}` → customer/merchant/admin.
- ETA recalculated from routing engine + live traffic every 30 s; push when "5 min away".
- Fallbacks: if socket drops → polling every 10 s; tracking link (no-login) via SMS/WhatsApp.
- Privacy: customer sees rider first name, photo, bike plate, **masked call/chat**; location only visible during active order.

## 6. Proof of delivery

1. Rider "Arrived" (geofence 80 m check, warn if outside).
2. Customer shows 4-digit **delivery OTP** → rider enters.
3. Fallback: photo at door + reason (customer unreachable) → ops review.
4. Parcel: pickup OTP at sender + delivery OTP at receiver; optional signature.
5. Fraud: OTP mismatch ×3 → ops call.

## 7. Cancellation, failure & refund

| Scenario                                                          | Outcome                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Customer cancels before merchant accepts                          | Full refund                                                                                           |
| After accept / preparing                                          | Partial or no refund (merchant cost), policy config                                                   |
| Merchant rejects / times out                                      | Full refund + apology credit                                                                          |
| Rider can't be found 10 min                                       | Auto-cancel option + refund + credit                                                                  |
| Customer no-show                                                  | Wait 5 min → call ×2 → return/forfeit; fee charged                                                    |
| Wrong/missing item                                                | In-app report within 2 h with photo → support → refund to wallet/original method; merchant chargeback |
| Rider accident/bike fault                                         | Reassign, hub support dispatch, customer notified, compensation credit                                |
| Refund destination: wallet instantly, or original method (T+3–7). |

## 8. Support & disputes

```mermaid
flowchart LR
  A[Customer / Merchant / Rider taps Help on order] --> B[Self-serve FAQ + order-aware bot]
  B -->|unresolved| C[Create ticket + chat]
  C --> D[Support agent console: order timeline, call masked, refund tool]
  D --> E{Needs ops/finance?}
  E -->|yes| F[Escalate]
  E -->|no| G[Resolve + CSAT]
```

SLA: first response < 3 min live chat, resolution < 24 h.

## 9. Rider shift & energy flow

```mermaid
flowchart TD
  A[Start shift at hub: bike check-out + battery scan] --> B[Go Online]
  B --> C[Receive offers → deliveries]
  C --> D{Battery < 25%?}
  D -->|yes| E[App routes to nearest hub / swap point; offers paused]
  E --> F[Swap or charge → resume]
  D -->|no| C
  C --> G[End shift: return bike, report faults, cash remittance]
  G --> H[Daily earnings summary + payout]
```

Fleet module tracks: bike ID, battery SoC/health, charge cycles, maintenance schedule, hub solar generation vs consumption, grid fallback.

## 10. Merchant daily flow

Open store (toggle) → receive order alert → accept + prep time → prepare → mark ready → hand to rider (pickup code) → view earnings → handle out-of-stock (toggle item) → weekly payout/statement. Delivery-only: tap "Request Rider" → enter pickup/drop/package → pay from wallet → track.

## 11. Admin operations loop

Live board (orders by state, late orders in red) → intervene (reassign/cancel/refund/call) → approve merchants/riders → manage pricing & promos → review fraud flags → run settlements → monitor fleet/solar → reports/exports.

## 12. Notification matrix

| Event                                                        | Customer     | Merchant      | Rider    | Ops   |
| ------------------------------------------------------------ | ------------ | ------------- | -------- | ----- |
| Order paid                                                   | push         | push+sound+WS | –        | –     |
| Accepted                                                     | push         | –             | –        | –     |
| Rider assigned                                               | push+SMS     | push          | offer    | –     |
| Picked up                                                    | push         | –             | –        | –     |
| 5 min away                                                   | push         | –             | –        | –     |
| Delivered                                                    | push+receipt | push          | earnings | –     |
| Late > SLA                                                   | push apology | push          | nudge    | alert |
| Payout sent                                                  | –            | SMS/email     | push     | –     |
| Channels degrade: push → SMS → WhatsApp for critical events. |
