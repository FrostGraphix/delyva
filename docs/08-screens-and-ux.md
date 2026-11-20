# 08 · Screen Inventory & UX

Legend: ✅ = designed in `design/*.html` · ◻ = specified, to design next.

> **Status note:** the ✅ marks are the target set. Built: every ✅ screen (customer, merchant, rider, admin). All ✅ screens are now built; only ◻ (later-phase) items remain.
> Frame sizes: phone 390×844 · tablet 1024×768 · desktop 1440×900.

## A. Customer app (`design/customer.html`)

### A1 Onboarding & auth

| #      | Screen                            | Notes                                  |
| ------ | --------------------------------- | -------------------------------------- |
| C01 ✅ | Splash                            | Logo + tagline                         |
| C02 ✅ | Welcome carousel (3 slides)       | Fast · Affordable · Reliable; Skip     |
| C03 ✅ | Phone entry                       | +234 prefix, T&Cs link                 |
| C04 ✅ | OTP verify                        | 6 boxes, resend timer, WhatsApp option |
| C05 ✅ | Profile setup                     | Name, referral code                    |
| C06 ✅ | Location permission + address pin | Map pin + landmark                     |
| C07 ◻  | Empty/no-service area             | Waitlist capture                       |

### A2 Discovery

| C08 ✅ | Home | Greeting, address, search, service tabs, promo carousel, categories, nearby merchants, reorder |
| C09 ✅ | Search | Recents, trending, results (stores/dishes), filters |
| C10 ✅ | Category / list | Filter chips, sort |
| C11 ✅ | Merchant page | Hero image, info, sticky categories, dishes |
| C12 ✅ | Item detail sheet | Modifiers, notes, qty, add |
| C13 ◻ | Favourites | |

### A3 Cart → payment

| C14 ✅ | Cart | Items, stepper, notes, promo, tip, fee breakdown |
| C15 ✅ | Checkout | Address, drop-off notes, ETA, payment method, total |
| C16 ✅ | Payment methods | Card / Transfer / USSD / Wallet / COD |
| C17 ✅ | Bank-transfer waiting | Virtual account, timer, copy, "I've paid" |
| C18 ✅ | Order placed / success | Animated check, track CTA |
| C19 ◻ | Payment failed | Retry/change method |

### A4 Tracking

| C20 ✅ | Order status (waiting for merchant) | Timeline |
| C21 ✅ | Live tracking map | Route, rider card, ETA, call/chat, share |
| C22 ✅ | Delivery OTP | 4-digit code shown to hand to rider |
| C23 ✅ | Delivered + rate | Stars, tags, tip, comment |
| C24 ✅ | Chat/Call sheet | Masked |
| C25 ◻ | Report an issue | Items missing, wrong, late; photo |

### A5 Parcels

| C26 ✅ | Send a parcel | Pickup/drop, size, category, notes |
| C27 ✅ | Parcel quote & pay | Price by band |
| C28 ◻ | Parcel tracking | Same as C21 w/ OTP ×2 |

### A6 Account

| C29 ✅ | Orders list (active/past) | Reorder |
| C30 ✅ | Order detail & receipt | Timeline, items, totals |
| C31 ✅ | Profile | Stats, addresses, wallet, referral, settings, help |
| C32 ✅ | Wallet | Balance, top-up, transactions |
| C33 ✅ | Addresses | Add/edit |
| C34 ✅ | Notifications inbox | |
| C35 ✅ | Help centre | FAQ + chat |
| C36 ✅ | Promos / referral | Share code |

States for every list: loading skeleton, empty, error + retry, offline banner.

## B. Merchant app (`design/merchant.html`)

| #      | Screen                                     | Notes                                         |
| ------ | ------------------------------------------ | --------------------------------------------- |
| M01 ✅ | Sign-up (link/QR) → business details       | 5-minute form                                 |
| M02 ✅ | Category, location, hours                  |                                               |
| M03 ✅ | Verification uploads + bank                |                                               |
| M04 ✅ | Menu upload options                        | WhatsApp / photo / sheet / manual             |
| M05 ✅ | Onboarding checklist & status              | Pending review → test order → live            |
| M06 ✅ | Dashboard                                  | Open toggle, today's stats, live orders, tips |
| M07 ✅ | New order alert (full-screen)              | Sound, countdown 3:00, accept/reject          |
| M08 ✅ | Accept with prep time                      | 10/15/20/30                                   |
| M09 ✅ | Orders board (tablet kanban)               | New / Preparing / Ready                       |
| M10 ✅ | Order detail                               | Items, rider ETA, pickup code, mark ready     |
| M11 ✅ | Menu manager                               | Categories, items, availability toggles       |
| M12 ✅ | Item editor                                | Photo, price, modifiers, stock                |
| M13 ✅ | Request rider (delivery-only)              | Pickup/drop, package, price, pay from wallet  |
| M14 ✅ | Earnings                                   | Chart, commission breakdown, payouts          |
| M15 ✅ | Payout statement                           |                                               |
| M16 ◻  | Promotions, reviews, staff, analytics (V2) |                                               |
| M17 ✅ | Store settings                             | Hours, busy mode, printers                    |

## C. Rider app (`design/rider.html`)

| #      | Screen                                       | Notes                                       |
| ------ | -------------------------------------------- | ------------------------------------------- |
| R01 ✅ | Sign-up + OTP                                |                                             |
| R02 ✅ | Documents & selfie                           | NIN/BVN, licence, guarantor                 |
| R03 ✅ | Application status + training                |                                             |
| R04 ✅ | Home / offline                               | Go-online slider, today stats, battery, hub |
| R05 ✅ | Online / waiting                             | Heat zones, demand                          |
| R06 ✅ | New offer                                    | Countdown ring, pickup→drop, fee, distance  |
| R07 ✅ | Navigate to store                            | Map + step bar + call                       |
| R08 ✅ | At store: verify pickup code, item checklist |                                             |
| R09 ✅ | Navigate to customer                         |                                             |
| R10 ✅ | Proof of delivery                            | OTP entry / photo fallback                  |
| R11 ✅ | Delivery complete                            | Earned, tip, next                           |
| R12 ✅ | Battery & hubs                               | SoC ring, range, nearest swap/charge        |
| R13 ✅ | Earnings                                     | Day/week, trips, cash-out, COD cash         |
| R14 ✅ | Report issue / SOS                           |                                             |
| R15 ✅ | Profile & documents                          |                                             |
| R16 ◻  | Incentives/quests (V2)                       |                                             |

## D. Admin dashboard (`design/admin.html`, desktop 1440)

| #      | Screen                             | Notes                                     |
| ------ | ---------------------------------- | ----------------------------------------- |
| A01 ✅ | Login + 2FA                        |                                           |
| A02 ✅ | Overview dashboard                 | KPIs, orders chart, SLA, alerts           |
| A03 ✅ | Live operations                    | Map + order board + rider list            |
| A04 ✅ | Order detail / intervention        | Timeline, reassign, refund                |
| A05 ✅ | Merchants list + pipeline          |                                           |
| A06 ✅ | Merchant review / catalogue editor | KYC, approve                              |
| A07 ✅ | Riders list + application review   |                                           |
| A08 ✅ | Pricing & commissions              | Bands, surge, fees                        |
| A09 ✅ | Promotions builder                 |                                           |
| A10 ✅ | Finance: settlements & payouts     | Ledger, run payout                        |
| A11 ✅ | Fleet & solar                      | Hubs, bikes, batteries, generation vs use |
| A12 ✅ | Support inbox                      |                                           |
| A13 ✅ | Fraud & trust                      |                                           |
| A14 ◻  | Roles, audit log, config           |                                           |

## E. Key UX flows (click paths)

1. **First order:** C01→C02→C03→C04→C05→C06→C08→C11→C12→C14→C15→C16→C18→C21→C22→C23.
2. **Merchant go-live:** M01→M02→M03→M04→M05→M06 (after approval).
3. **Order handling:** M07→M08→M10 (preparing→ready)→handover.
4. **Rider delivery:** R04→R05→R06→R07→R08→R09→R10→R11.
5. **Ops intervention:** A03→A04→reassign/refund.

## F. UX rules

- Max 3 taps from home to add an item; checkout in ≤ 3 screens.
- Always show total + ETA in sticky footer on cart/checkout.
- Never block on location: allow manual address.
- Errors are recoverable inline; keep user's cart/state.
- Rider app: one primary action per step; glove-friendly 56 px buttons; high contrast for sunlight; voice/haptic cues.
- Merchant: alert is the product — loud, repeating, unmissable; 1-tap accept.
- Admin: keyboard shortcuts, saved filters, density toggle, everything exportable.
