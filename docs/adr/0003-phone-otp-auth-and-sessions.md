# ADR 0003 — Phone OTP authentication and session tokens

- Status: Accepted
- Date: 2026-11-19

## Decision

- OTP: 6 digits from a CSPRNG, 5-minute expiry, max 5 verify attempts per challenge, stored only as
  `HMAC-SHA256(pepper, "otp:" + challengeId + ":" + code)`; phones are looked up by an HMAC
  (`phone_hash`). A new request supersedes older open challenges.
- Abuse limits (Redis sorted-set sliding window): 60 s resend cooldown and 3 sends / 10 min per phone,
  10 sends / 10 min per IP, 10 verifies / 10 min per phone+IP.
- `POST /v1/auth/otp/request` requires an `Idempotency-Key` (Redis, 24 h).
- Access token: JWT signed with **EdDSA (Ed25519)** via `jose`, 15 minutes, `kid` header, claims
  `sub`, `roles`, `did` (device id), `iss`, `aud`. Public keys at `/.well-known/jwks.json`.
- Refresh token: 256-bit opaque random value, stored hashed, bound to a device, 30-day expiry, in a
  rotation family. Each use marks it used (conditional update) and issues a new one in the same family;
  presenting a used/revoked token, or losing the race, revokes the whole family
  (`refresh_token_reused`).
- SMS behind `SmsSender`: `TermiiSmsSender` (production) and `DevSmsSender` (stores the latest code in
  Redis `dev:otp:<phone>` for 5 minutes; refused in production by env validation). Neither logs codes.

## Consequences

- Key rotation needs multiple keys in JWKS (DEBT). Production keys come from Secrets Manager.
- `trust proxy` must be configured behind the load balancer so per-IP limits use the client IP (DEBT).
