# 05 · Features by App

Tags: **MVP** (launch) · **V2** (first 3–6 months) · **V3** (later).

## 1. Customer app (iOS + Android, + light web)
**Account** — phone OTP login MVP · guest browse MVP · profile/avatar MVP · saved addresses (home/work/other, pin + landmark) MVP · referral code MVP · language switch V2 · biometric lock V3.
**Discovery** — location-based home MVP · service tabs (Food/Groceries/Parcels/More) MVP · categories + cuisines MVP · search (stores+dishes, recent, trending) MVP · filters (rating, price, delivery time, open now, free-delivery) MVP · promos/banners MVP · "Early partners" featured MVP · favourites V2 · reorder MVP · collections/curation V2.
**Merchant page** — hero, rating, ETA, fee, hours · menu with sticky categories · item sheet with modifiers/notes · group order V3.
**Cart & checkout** — multi-item cart (single merchant) MVP · delivery address + notes + leave-at-door MVP · price breakdown MVP · promo/voucher MVP · tip rider MVP · schedule order V2 · payment methods (card, transfer, USSD, wallet, COD) MVP · saved cards V2 · substitution preferences (grocery) V2.
**Parcels** — pickup/drop pins, package size, category, value, notes, contact at both ends, quote, pay MVP · schedule V2 · multi-stop V3.
**Tracking** — status timeline MVP · live map + rider card + ETA MVP · call/chat masked MVP · share tracking link MVP · delivery OTP MVP.
**Post-order** — rating (rider, merchant, tags) MVP · receipt PDF MVP · report issue with photos MVP · tip after delivery V2.
**Wallet & rewards** — wallet top-up V2 · refunds to wallet MVP · loyalty points V3 · Delyva Plus subscription V3.
**Help** — FAQ, order-aware help, live chat, call, WhatsApp MVP.
**Notifications** — push/SMS/in-app inbox MVP · preferences V2.
**Offline/edge** — low-data mode (smaller images) V2 · skeleton loaders, retry states MVP.

## 2. Merchant app (RN) + Merchant web dashboard (Next.js)
**Onboarding** — self-registration (link/QR) MVP · KYC upload MVP · bank verification MVP · assisted menu upload via WhatsApp/photo/sheet (back-office) MVP · test order MVP · onboarding checklist + support contact MVP.
**Orders** — live order inbox with sound/vibration MVP · accept (with prep time) / reject (reason) MVP · status buttons preparing/ready MVP · rider ETA + pickup code MVP · order history/search MVP · auto-print / Bluetooth printer V2 · kitchen display V3.
**Store control** — open/closed toggle + schedule MVP · busy mode (add prep time) MVP · item availability toggle MVP · pause store V2.
**Menu/catalog** — categories, items, photos, modifiers, price, stock MVP · bulk import CSV V2 · inventory counts & low-stock alerts V2 · multiple branches V2.
**Delivery-only** — request rider for off-platform order MVP · saved customers V2 · tracking link to customer MVP · bulk/API V3.
**Money** — today's sales, orders, avg basket MVP · earnings & payouts statement MVP · commission breakdown MVP · refunds/chargebacks view MVP · wallet for delivery-only fees MVP.
**Growth** — promotions (discount, free delivery, BOGO) V2 · ads/featured placement V3 · reviews & replies V2 · referral rewards MVP · analytics (top items, peak hours) V2.
**Staff** — multiple staff accounts with roles V2.
**Support** — help centre, chat, dispute order MVP.

## 3. Rider app (RN, Android-first)
**Onboarding** — sign-up, selfie liveness, NIN/BVN, licence, guarantor, bank, training quiz MVP · status tracker + missing-docs prompts MVP.
**Shift** — go online/offline MVP · check-in at hub, bike scan (QR) MVP · break mode V2 · shift schedule/zone heatmap V2.
**Offers** — full-screen offer card with pickup, drop, distance, fee, ETA, 30 s countdown MVP · accept/decline MVP · batched offers V2.
**Delivery** — step flow (to store → at store → picked up → to customer → at customer → delivered) MVP · in-app navigation + open in Google Maps MVP · pickup code check MVP · call/chat masked MVP · order checklist MVP · OTP or photo proof MVP · issue reporting (cant reach, wrong address, bike fault, accident) MVP · SOS button V2.
**Energy** — battery % + range estimate MVP · nearest hub/swap point & route MVP · low-battery guard MVP · charging log V2.
**Earnings** — today/week, per-trip breakdown, tips, bonuses MVP · cash-out (instant/weekly) MVP · COD cash tracker MVP · incentives/quests V2 · tax summary V3.
**Profile** — documents, vehicle, ratings, acceptance rate, training MVP · refer a rider V2 · support MVP.
**Resilience** — offline queue, low-data maps, background location with battery optimisation MVP · anti-spoofing MVP.

## 4. Admin / Operations dashboard (web)
**Live ops** — live map (riders, orders, hubs), order board by status, late/at-risk highlighting, search by order/phone MVP · manual assign/reassign/cancel/refund MVP · call/chat from console MVP · zone heatmap & demand V2.
**Merchants** — pipeline (leads → onboarding → live), review KYC, approve/suspend, commission overrides, catalogue editor (assisted upload tool) MVP · outreach CRM for Bashir's team V2.
**Riders** — applications, KYC review, training status, performance, suspend, cash reconciliation MVP.
**Customers** — profiles, orders, wallet, flags, block MVP.
**Pricing & promos** — distance bands, surge rules, service fee, commission per category, promo builder, referral rules MVP.
**Finance** — ledger explorer, settlements run, payout batches, reconciliation exceptions, COD remittance, tax reports MVP · automatic payout schedules V2.
**Fleet & energy** — hubs, bikes, batteries SoC/health, charging sessions, maintenance calendar, solar generation vs use, grid fallback MVP (basic) · IoT telemetry V2 · predictive maintenance V3.
**Support** — ticket inbox, SLA timers, macros, refund tool, CSAT MVP.
**Fraud & trust** — promo-abuse, GPS-spoof, COD risk, duplicate-device flags MVP.
**Content & config** — banners, categories, cities/zones polygons, feature flags, notification templates MVP.
**People & security** — roles/RBAC, 2FA, audit log MVP.
**Analytics** — GMV, orders, cost/order, contribution margin, cohorts, merchant & rider leaderboards, exports V2.

## 5. Cross-cutting
Notifications service · Search · Media pipeline · i18n · Accessibility · Feature flags · A/B testing (V2) · Help centre CMS · Legal (T&Cs, privacy, permitted-items policy) · App-version gating.

## 6. MVP definition (from proposal: "Build first")
Reliable **ordering, payments, merchant management and dispatch**:
Customer (OTP, discover, cart, pay, track, rate) · Merchant (register, menu, orders, payouts) · Rider (onboard, offers, navigate, POD, earnings) · Admin (live board, approvals, pricing, settlements, basic fleet).
