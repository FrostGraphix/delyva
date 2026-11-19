# 01 · Product & Business

## 1. Vision
A recognisable Nigerian tech brand connecting consumers, businesses, transport and commerce in one platform. We start with **cheap last-mile delivery** made possible by **electric motorcycles + solar-powered hubs**, then expand into scheduled delivery, merchant fulfilment, multi-stop routes, interstate logistics and mobility.

**Promise:** Fast. Affordable. Reliable.  **Tagline:** Delivered Your Way.

## 2. The problem we solve
| Problem | Effect |
|---|---|
| Petrol cost | Delivery fees too high for low-ticket orders |
| Expensive fees | Customers skip small meals/groceries |
| Inefficient logistics | Idle riders, repeat pickups, weak dispatch |
| Limited merchant access | Small shops can't afford / understand existing platforms |
| Unreliable service | Unpredictable ETAs, no proof of delivery |

## 3. Solution = four levers
1. **Electric motorcycles** – energy cost per km collapses vs petrol.
2. **Solar hubs** – each hub = dispatch centre + rider base + charging station + parking + maintenance + consolidation area.
3. **Intelligent routing & batching** – nearest-rider matching, combined deliveries.
4. **Simple digital platform** – digital payments, auto-commissions, live tracking, easy merchant tools.

## 4. Services at launch
| Code | Service | Notes |
|---|---|---|
| A | Food delivery | Restaurants, order → pay → delivered |
| B | Groceries & shopping | Supermarkets, neighbourhood stores, drinks, household |
| C | Parcels & packages | P2P and B2B, documents and permitted items only |
| D | Merchant logistics | "Delivery-only" bookings, incl. orders taken off-platform (WhatsApp/Instagram sellers) |

Coming next: scheduled deliveries, merchant fulfilment, multi-stop routes, interstate logistics, commerce & mobility.

## 5. Personas
| Persona | Goal | Key needs |
|---|---|---|
| **Customer (Amaka, 27, Lagos)** | Cheap meal at 8pm | Transparent fee, live tracking, pay by transfer/card, support |
| **Merchant (Mama Put owner / pharmacy / supermarket)** | More orders without cost | 5-minute signup, WhatsApp menu upload, simple order screen, weekly payout |
| **Rider (Tunde, 24)** | Steady income | Verified onboarding, fair offers, battery info, instant earnings view |
| **Ops agent (hub supervisor)** | Keep SLAs | Live map, reassign, battery/charging, escalations |
| **Admin / Finance** | Control margin | Pricing, commissions, settlements, fraud checks, reports |

## 6. Pricing model (illustrative, from proposal)
| Distance | Fee (₦) |
|---|---|
| Up to 2 km | 300 |
| 2–4 km | 450 |
| 4–6 km | 650 |
| 6 km+ | by distance & route |

Final fee = `base(distance band)` + `weight/size surcharge` + `peak/rain/night multiplier` + `batching discount` − `promo`. Configurable in Admin → Pricing; versioned and effective-dated.

### Revenue streams
- Delivery fee margin (customer fee − rider payout − energy/ops).
- Merchant commission on food/grocery orders (starting range 10–15 %, configurable per category; **0 % during introductory phase**).
- Parcel / delivery-only fee.
- Sponsored placement ("Early-partner visibility", later paid).
- Service fee (small, ₦50–100 optional).
- Later: subscriptions (Delyva Plus – free delivery over a threshold), advertising, B2B contracts.

### Payout model
- Rider: per-delivery base + distance + bonuses (peak, streak, quest). Weekly/daily cash-out to bank.
- Merchant: order value − commission − promo costs, settled T+1/weekly to bank via Paystack/Flutterwave subaccounts or bulk transfer.

## 7. Merchant incentives (launch)
Free registration · no compulsory subscription · launch delivery discounts · free listing setup (we digitise menus) · merchant referral rewards · early-partner visibility.

## 8. Unit-economics sketch (tune with real data)
```
Avg order (food)       ₦6,000        Customer delivery fee      ₦450
Commission 12 %          ₦720        Rider payout               ₦300
Payment fee (1.5%+₦100)  −₦190       Energy + maintenance/order  ₦40
Contribution/order      ≈ ₦640       Support+promo allowance    −₦120  → ≈ ₦520
```
Target: contribution positive at **>40 orders/rider/week** with batching; hub breakeven sized to fleet + solar capacity.

## 9. Nigeria-specific design constraints
- **Payments:** card, bank transfer (virtual account per order), USSD, wallet, **cash on delivery (limited)**. Provider: Paystack + Flutterwave fallback.
- **Connectivity:** flaky data → offline-tolerant rider app, SMS/OTP fallback, low-bandwidth images, WhatsApp support.
- **Addresses:** informal – pin-drop + landmark + "call me" notes, what3words-like pin sharing, rider-calls-customer masked number.
- **Power:** solar + grid backup; battery SoC drives rider assignment.
- **KYC:** NIN/BVN verification, driver licence/guarantor for riders, CAC/business name for merchants (optional for micro-vendors, tiered).
- **Regulation:** NDPR/NDPA data protection, CBN-compliant payments via licensed PSPs, FCCPC consumer rules, permitted-items policy for parcels.
- **Currency:** NGN only at launch; store amounts as integer **kobo**.
- **Languages:** English first; Pidgin, Hausa, Yoruba, Igbo in V2.

## 10. Team & ownership (from proposal)
| Person | Share | Area |
|---|---|---|
| Nasir | 40 % | Strategy, capital, partnerships |
| Abdulsamad | 30 % | Product, software, brand, UX, infra |
| Nafiu | 30 % | Fleet, riders, solar, hubs, suppliers |
| Bashir (contributor) | – | Merchant acquisition |
| Adam (contributor) | – | Digital growth & marketing |

## 11. KPIs
- Activation: merchants live / signed, time-to-first-order.
- Demand: orders/day, repeat rate (D30), basket size, delivery fee as % of basket.
- Supply: rider utilisation, orders/rider/hr, idle time, battery downtime.
- Quality: on-time %, cancellation %, rating, refund rate, support tickets/100 orders.
- Money: cost per order, contribution margin, CAC, payout accuracy, fraud loss.
