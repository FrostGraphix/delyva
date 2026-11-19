# 07 · Design System — "Delyva Liquid Glass"

One token set shared by the customer, merchant, rider and admin apps. Direction: lime + ink brand, flat content, glass only on the floating control layer (Apple Liquid Glass rule), photo-first, big radii.
Live version: `design/design-system.html` · Tokens: `design/assets/delyva.css` + `design/assets/liquid.css` (loaded last, wins).

## 1. Principles
1. **Content flat, controls glass** – cards and rows are solid; glass is for tab bar, sheets, toasts and buttons floating over maps/photos. Never glass on glass.
2. **Photo first** – food/product imagery carries the screen; chrome stays quiet.
3. **One accent** – lime means go / primary / success. Ink for primary text and primary buttons.
4. **Clarity over decoration** – price, ETA and status are always the loudest text.
5. **Thumb-friendly, low-end-Android-friendly** – 48 px targets, blur used sparingly, solid fallback, skeletons not spinners.

## 2. Colour tokens
| Token | Hex | Use |
|---|---|---|
| `--ink-900` | `#0B0F0A` | Text, primary button, selected chip |
| `--ink-700` | `#2B3029` | Secondary headings |
| `--ink-500` | `#6E746B` | Secondary text |
| `--ink-300` | `#B3B8AF` | Placeholder, disabled |
| `--line` | `#E6E8E1` | Hairlines |
| `--stage` | `#F1F2F0` | App background (neutral grey) |
| `--paper` | `#FFFFFF` | Cards, inputs (flat) |
| `--mint` / `-2` / `-3` | `#CFEBD3` / `#BFE6C0` / `#DDF3D0` | Grey-to-aqua-green wash behind glass |
| `--lime-100` | `#EAF5CF` | Highlights, soft buttons |
| `--lime-500` | `#8CC63F` | **Brand primary** |
| `--lime-600` / `-700` | `#6BA52A` / `#4C7D1A` | Pressed, text on light |
| `--sun` | `#FFB020` | Solar/energy, ratings, warnings |
| `--danger` | `#E5484D` | Errors, cancel, late |
| `--info` | `#2E9BE6` | Info, preparing, links |

Buttons: ink = `--ink-btn` gradient (`#343C30→#0B0F0A`), brand = `--lime-btn` (`#C4E877→#8CC63F→#7DB635`). Text on lime is ink (never white). Status colours always come with a label or icon.

## 3. Typography
Headings **Plus Jakarta Sans** 700/800 · UI/body **Inter** 400/500/600 · tabular numerals for ₦ and ETAs.
| Style | Size/Line | Weight |
|---|---|---|
| Display | 32/38 | 800 |
| H1 | 26/32 | 800 |
| H2 | 20/26 | 700 |
| H3 | 17/22 | 700 |
| Body L | 16/24 | 500 |
| Body | 14/20 | 400 |
| Caption | 12/16 | 500 |
| Micro | 10/12 | 600 caps |

Letter-spacing −0.02em from 20 px up. Min body 14 px.

## 4. Spacing, radius, elevation
- Spacing 4-pt: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72. Gutter 16 phone / 24 tablet / 32 desktop.
- Radius: 8 · 12 · 16 · 20 · 28 · 36 · pill. **Concentric rule:** outer radius = inner radius + padding (tab bar 36 = lens 28 + 8).
- Flat elevation (`--flat-sh`) for content; glass elevation `--sh-glass` (`0 1px 2px / 0 10px 28px`, green-tinted), `--sh-float` for sheets and floating buttons.

## 5. Liquid Glass tokens
`--glass-blur: blur(26px) saturate(1.9) brightness(1.04)` · fill `rgba(250,252,249,.52)` · 1.2 px gradient rim `--rim` (mask-composite) · inner highlights `--hi` · shadow `--sh-glass`. Fall back to solid `#fff` under `prefers-reduced-transparency` and on low-end devices. Section 13 lists what gets glass.

## 6. Iconography & imagery
One set: **Phosphor Regular** (or Lucide), 24 px grid, ~1.75 px stroke, rounded caps. The prototype ships an equivalent drawn set in `ui.js`; swap to Phosphor in production. Icons in chrome only. Food/product imagery is real photography (4:3 or 1:1); emoji tiles in the prototype are placeholders, never for production.

## 7. Components
- **Buttons** – Ink (primary), Brand (lime), Soft, Glass (over maps/photos only), Ghost, Danger, icon-only 44 px. Sizes 56 / 48 / 36. States: default, pressed (scale .98), loading, disabled.
- **Inputs** – flat white rounded fields with leading icon, 6-box OTP, search + filter, stepper, chips (selected = ink fill), segmented control, toggle, radio/checkbox (lime), textarea.
- **Cards** – merchant, dish, order, stat tile, promo, rider, wallet: all flat.
- **Navigation** – glass bottom tab bar with floating centre action (customer cart, merchant bike, rider power); top bar; stepper timeline; admin sidebar 248 px (72 collapsed).
- **Feedback** – toast and bottom sheet (glass), modal, skeleton, empty/error state, progress ring, status pill, offline banner.
- **Data** – flat tables, KPI tiles, charts, map panel.
- **Map** – lime rider pin with pulse, ink store pin, red home pin, route `--lime-600` 5 px with white casing.

## 8. Status colour map
| Status | Colour | Label |
|---|---|---|
| Pending | `--sun` | Waiting |
| Accepted / preparing | `--info` | Preparing |
| Ready / assigned | `--lime-500` | Ready |
| In transit | `--lime-600` | On the way |
| Delivered | `--lime-700` on lime-100 | Delivered |
| Cancelled / failed | `--danger` | Cancelled |

## 9. Layout & breakpoints
| Name | Width | Target | Layout |
|---|---|---|---|
| `xs` | 320–359 | small Android | 1 col, 12 px gutter |
| `sm` | 360–413 | **base phone (390×844)** | 1 col, 16 px gutter |
| `md` | 414–767 | large phone | 1 col, max 520 centred |
| `tablet` | 768–1023 | merchant tablet | 2 col, 72 px side rail |
| `lg` | 1024–1279 | small laptop | sidebar 248 + 12-col |
| `xl` | 1280–1535 | desktop | max 1200 + 360 right panel |
| `2xl` | ≥1536 | wide | max 1440 |

Safe areas: notch 47, home indicator 34. Merchant tablet is landscape 1024×700: New · Preparing · Ready board.

## 10. Motion
120 (micro) · 200 (standard) · 320 (sheet/page) ms, easing `cubic-bezier(.2,.8,.2,1)`. Sheets slide with backdrop fade, rider pin eases between pings, ring stroke animates, success check bounces. Respect `prefers-reduced-motion`.

## 11. Accessibility & voice
WCAG 2.2 AA · targets ≥ 44 pt · focus ring 2 px ink + 2 px lime · labels never colour-only · screen-reader labels on icon buttons · haptics on offer/accept · merchant order sound adjustable. Voice: warm, short, Nigerian-friendly English; ₦ with thousands separators; 12-hour time; errors say what happened and what to do.

## 12. Tokens → code
`packages/tokens` JSON (Style Dictionary) → CSS vars (web/admin), TS object (React Native), Figma Variables. Components in `packages/ui` (RN + web), Storybook, Chromatic. Admin: Next.js + shadcn/ui restyled with these tokens. Mobile: Expo with plain stylesheets on the shared tokens (NativeWind optional).

## 13. Liquid Glass — where it is (and is not) used
Rule (matches Apple's guidance): **glass is the floating control layer above content; content stays flat.** Glass is never stacked on glass.

| Glass (translucent, blur, specular rim) | Flat (solid white / tint, soft shadow) |
|---|---|
| Bottom tab bar + active-tab lens | Cards, list rows, order/merchant/dish cards |
| Bottom sheets (item, address, tracking, rider card) | Inputs, text areas, OTP boxes, steppers, segmented control |
| Back / share / heart buttons over maps and hero photos | Chips and tags (except chips floating over maps) |
| Overlays on maps (ETA pill, status pills, "looking for orders") | Stat tiles, price breakdowns, tables, charts |
| Toasts, scrim | Admin sidebar and top bar, forms, settings rows |
| Offer/alert overlays over dark backdrops | Primary (ink) and brand (lime) buttons — solid for contrast |

Implementation: `design/assets/liquid.css` (v4 section). Glass tokens: `--glass-blur`, rim gradient `--rim`, highlight `--hi`. Content uses `--paper` + `--flat-sh`.
