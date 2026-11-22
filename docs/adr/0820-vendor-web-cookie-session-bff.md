# ADR 0820 — Vendor web: cookie-session BFF, realtime tickets, loud order alert

- Status: accepted
- Date: 2026-11-22

## Context

CLAUDE.md requires httpOnly, Secure, SameSite cookies and CSRF protection for the web apps, and a vendor app that is "loud and impossible to miss" on new orders. The API authenticates with a 15-minute Bearer JWT plus a rotating refresh token, and Socket.IO handshakes need that JWT. A browser holding those tokens in JS storage would expose them to XSS.

## Decision

1. **Next.js server layer as BFF.** `apps/vendor-web/app/api/auth/otp/{request,verify}` and `/logout` call the API; `verify` stores the token pair only in cookies: `dv_at` (access), `dv_rt` (refresh), `dv_did` (device id; the API binds tokens to it) — all `httpOnly; Secure; SameSite=Lax; Path=/` — and `dv_csrf` (readable). The browser only ever receives `{ ok: true }`. `Secure` is always set (browsers treat localhost/127.0.0.1 as secure contexts).
2. **Same-origin proxy** `/api/v1/*` forwards an explicit allowlist of vendor routes (`lib/server/bff.ts`) with the Bearer token from the cookie. The browser uses the typed `@delyva/sdk` client with `baseUrl = <origin>/api` and no token.
3. **Server-side refresh.** When the access cookie is missing (it expires 30 s before the JWT) or the API answers 401, the BFF rotates the refresh token once (`refreshOnce` dedupes concurrent callers per process, because replaying a used refresh token revokes the whole family) and re-sets the cookies on the response. A failed refresh clears the session and returns 401, and the shell redirects to `/login`.
4. **CSRF.** Mutating requests (non-GET/HEAD/OPTIONS) must pass: `Sec-Fetch-Site != cross-site`, `Origin` equal to the app origin or in `VENDOR_WEB_ALLOWED_ORIGINS`, and (once a session exists) a double-submit `x-csrf-token` header equal to the `dv_csrf` cookie, compared in constant time. Login endpoints check origin only (no session yet).
5. **Uploads** go browser → `/api/uploads` (multipart) → API `POST /v1/uploads` → server-side PUT to the signed URL, so signed URLs and tokens never reach the browser. The API still enforces MIME/size/magic-byte policy.
6. **Realtime without exposing the JWT.** Chosen: a *short-lived single-use socket ticket*. Additive API endpoint `POST /v1/realtime/tickets` (auth) returns a 256-bit random ticket stored in Redis for 60 s (`SET EX`, redeemed with `GETDEL`, rate limited per user). The gateway handshake accepts `auth.ticket` in addition to `auth.token`, binding the socket to the principal that minted it. The browser asks the BFF for a fresh ticket on every (re)connect. A server WebSocket proxy was rejected (extra stateful hop, breaks horizontal scaling and the Redis adapter's rooms). Also additive: `GET /v1/me/vendors` (caller's memberships with branch ids) so the portal can resolve its `vendorId` without a client-supplied id.
7. **Live board.** New/Preparing/Ready columns from `GET /v1/vendors/{id}/orders?status=` queries, refreshed by `order:status` socket events (rooms joined per listed order) with a 10 s polling fallback; `PLACED` is polled every 5 s because there is no vendor-wide room yet (DEBT). Alert: red pulsing banner (static under reduced motion), repeating Web Audio chime (unlocked by an explicit "Enable order sound" gesture, since browsers block autoplay), flashing tab title, and a countdown to auto-reject from `NEXT_PUBLIC_AUTO_REJECT_SECONDS`.
8. **Headers.** CSP (`default-src 'self'`, `frame-ancestors 'none'`, `connect-src` incl. the realtime origin), HSTS in production, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

## Consequences

- No token is reachable from page JS; an XSS cannot exfiltrate the session (it can still act within the origin, mitigated by CSP and CSRF).
- `DELYVA_API_URL` (server) and `NEXT_PUBLIC_REALTIME_URL` (browser, API origin) are required config. The API must be reachable by WebSocket from the browser origin.
- DEBT: per-process refresh dedupe; CSP still allows `'unsafe-inline'` scripts; no vendor-scoped order room; payout read endpoint missing; busy mode and category CRUD missing in the API.
