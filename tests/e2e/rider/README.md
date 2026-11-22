# Rider app E2E

Drives the Expo **web build** of `apps/rider-mobile` (Pixel 7 emulation) against the real API, Postgres and Redis,
through all 24 screens: sign-in, 6 application steps, review, approval (ops API + TOTP), go online, a real dispatch
offer, pickup code, offline-queued "picked up", delivery OTP (wrong then right), earnings, profile, report issue and
the offline state. Screenshots go to `tests/e2e/rider/screenshots/` (gitignored). Any console error fails the run.

## Prerequisites

- `docker compose up -d` for the `delyva` services (Postgres `127.0.0.1:55432`, Redis `127.0.0.1:56379`).
- A built API: `pnpm --filter @delyva/api build`.
- Ports 3321 (API) and 3421 (web + proxy) free. The suite uses database `delyva_riderapp_e2e` and Redis db 10 only,
  and **recreates both on every start**.

## Run

```sh
pnpm e2e:rider                          # boots the stack, runs the suite, stops the stack
RIDER_E2E_SKIP_EXPORT=1 pnpm e2e:rider  # reuse apps/rider-mobile/dist-web-e2e (skip the ~3 min web export)
```

Re-export the web build after any change in `apps/rider-mobile` (run without `SKIP_EXPORT`).

Manual two-terminal mode (useful for debugging): `node tests/e2e/rider/stack.mjs`, then in another shell
`RIDER_E2E_EXTERNAL=1 pnpm playwright test -c tests/e2e/rider/playwright.config.mjs`.
Playwright's own `webServer` launch is not used by default (unreliable on Windows).

## Notes

- The API rate-limits OTP sends per IP (10 per 10 min). Restart the stack between runs; it resets Redis db 10.
- Expo Router keeps earlier screens mounted, so the spec matches only visible test ids (`vis()`).
- The server judges "too far" from the rider's live position (updated every ~4.5 s on a trip), so the spec retries
  "I have arrived" after moving the browser geolocation.
- If a run is killed, stop leftover `node` processes whose command line contains `rider/stack.mjs` or this worktree's
  `apps/api/dist/src/main.js`.
