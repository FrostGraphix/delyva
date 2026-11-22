# ADR 0830 — Admin web: cookie-only BFF session, CSRF and role gate

- Status: accepted
- Date: 2026-11-22

## Context

The admin console (`apps/admin-web`, Next.js App Router) drives money- and approval-affecting actions. CLAUDE.md requires httpOnly Secure SameSite cookies, CSRF protection and mandatory TOTP 2FA for admin and finance roles. ADR 0700 §9 defined the API side (`/v1/admin/2fa/*`, `x-admin-2fa`) and said the admin BFF would hold the 2FA proof in an httpOnly cookie.

## Decision

1. **Browser never holds a token.** Access JWT, refresh token, device id, the 2FA session token and the CSRF secret live only in cookies `dl_admin_at`, `dl_admin_rt`, `dl_admin_did`, `dl_admin_2fa`, `dl_admin_csrf`: `httpOnly; Secure; SameSite=Strict; Path=/`. The access cookie expires 30 s before the JWT; the refresh cookie lasts 30 days (the API revokes on its own schedule).
2. **Server layer = Next route handlers** (`app/bff/**`). Auth routes (`otp/request`, `otp/verify`, `2fa/enrolment`, `2fa/confirm`, `2fa/verify`, `logout`, `session`) validate bodies with the shared Zod schemas; `app/bff/v1/admin/[...path]` is a same-origin proxy restricted to `/v1/admin/*` that adds `Authorization: Bearer …` and `x-admin-2fa` from the cookies. The browser SDK (`DelyvaClient`, `baseUrl: '/bff'`) is configured with **no** token options.
3. **Role gate at three layers.** (a) `otp/verify` decodes the access token's roles (unverified, routing only) and, if the account has none of support/ops/finance/super_admin, revokes the fresh refresh token and returns 403 without setting cookies. (b) The `(console)` layout redirects to `/login` without a refresh cookie and to `/login?step=2fa` without a 2FA cookie. (c) The API remains the authority: `AuthGuard` roles + `AdminTwoFactorGuard`; the UI hides sections per `lib/roles.ts` (mirrors controller `@Roles`).
4. **CSRF.** Mutating BFF requests (anything except GET/HEAD/OPTIONS) must (a) carry an `Origin` equal to the `Host` and (b) echo the CSRF cookie value in `x-csrf-token` (synchroniser token handed to the page by `GET /bff/auth/session`, kept in memory only). `SameSite=Strict` is a third layer.
5. **Refresh rotation.** The BFF refreshes when the access cookie is missing or the API answers 401, once per request. Concurrent requests with the same refresh token share one rotation (in-process, 15 s) so a legitimate burst is not mistaken for token replay (which would revoke the family).
6. **2FA flow.** Phone OTP → TOTP verify (`/login?step=2fa`); first-time admins enrol in-page (secret and otpauth URI shown once, never stored by the BFF) and confirm with a code. The 2FA cookie lifetime equals the API session TTL. On `two_factor_required` the client routes to the TOTP step; on 401 to `/login`.
7. **Security headers** via `next.config.ts`: CSP (`default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP, and HSTS in production.
8. **Data tables** use TanStack Table v9 (`@tanstack/react-table@9.3.1`, MIT, ~15 kB gz for core rows; features are opt-in) with server-side filtering/paging. Server state uses TanStack Query via the SDK.

## Consequences

- No token can be exfiltrated by XSS; a compromised page can still act as the admin while the session lives (CSP + framework escaping mitigate; an XSS-proof design is out of scope).
- The proxy only exposes `/v1/admin/*`, so customer/rider endpoints are unreachable through the console origin.
- DEBT: CSP allows `'unsafe-inline'` scripts (Next bootstrap) until nonces/SRI; refresh de-duplication is per process (needs a Redis lock when admin-web scales horizontally); pricing admin and catalog go-live are still not behind `AdminTwoFactorGuard` on the API (ADR 0700), so the proxy sends the 2FA header but those routes do not require it yet.
