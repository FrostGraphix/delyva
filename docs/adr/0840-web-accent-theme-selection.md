# ADR 0840 — Web apps: accent theme selection via a server-rendered cookie

- Status: accepted
- Date: 2026-11-22

## Context

`packages/design-tokens` ships two accent themes (`green`, `orange`) as `:root[data-accent=...]` CSS blocks. The vendor portal and admin console need a user-selectable accent with no flash of the wrong colour and without loosening the CSP (no nonce infrastructure yet, see the vendor `next.config.ts` DEBT).

## Decision

1. The choice is a UI preference stored in the non-sensitive cookie `dl_accent` (`SameSite=Lax; Path=/; Max-Age=1 year`, not httpOnly). Helpers live in `packages/ui-web/src/accent.ts` (`parseAccent`, `accentFromCookieString`, `applyAccent`); values are validated with `isAccentName` and fall back to `DEFAULT_ACCENT`.
2. The root layout of each app reads the cookie on the server and renders `<html data-accent>`, so the first paint is correct; no inline script is added.
3. `AccentSwitcher` (`packages/ui-web`) is a radio group (swatch + name + text "Selected" badge, so selection is never colour-only). On change it sets the attribute and the cookie immediately.
4. Brand-coloured utility classes use tokens only (`primary`, `accent-100…700`); semantic success greens stay semantic. The static favicon (`apps/vendor-web/app/icon.svg`) is the brand mark and is not accent-driven.

## Consequences

- The root layouts call `cookies()`, so pages render dynamically (both apps are authenticated BFFs; no static pages are lost).
- Preference is per browser, not per account. A per-user setting would need an API field (not in scope).
- E2E: `tests/e2e/vendor` and `tests/e2e/admin` switch accents, assert the computed primary colour, reload for persistence and screenshot both accents.
