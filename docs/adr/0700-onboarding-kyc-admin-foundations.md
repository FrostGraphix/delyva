# ADR 0700 — Onboarding, KYC, private uploads and admin foundations

- Status: accepted
- Date: 2026-11-20

## Context

Riders and vendors must onboard through multi-step, resumable flows (CLAUDE.md → Onboarding), with KYC, payout bank verification and ops review. Admin actions that change roles or approval state need a reason, an immutable audit trail and mandatory TOTP 2FA. KYC IDs, bank account numbers and similar PII need field-level encryption.

## Decision

1. **Two new bounded contexts.** `onboarding` owns `rider_applications`, `vendor_applications`, `uploads`; `admin` owns `audit_log`, `feature_flags`, `admin_totp_factors`. Migration `0700_onboarding_admin.sql` (self-contained, no cross-context FKs).
2. **Cross-context calls only through public services.** Identity: new `RoleGrantService.grant` (minimal; roles stay on `users.roles`, picked up on the next token refresh). Catalog: new `VendorOnboardingService` (draft vendor + owner membership, branch pin with zone via `GeoService`, hours, inactive draft menu, draft↔in_review) and the existing `ApproveVendor` go-live path. Payments: `PaymentsService.resolveBankAccount` (Paystack `GET /bank/resolve`).
3. **Steps** are strictly ordered, saved at every step, re-savable, and resumable (`currentStep`). Rejected applications reopen for edits. Optimistic concurrency via `version`. Every completion/view emits `onboarding.step.completed|viewed` through the outbox with `analyticsEvent` = PostHog name.
4. **KYC** behind `KycProvider`. `FakeKycProvider` (deterministic rules) for dev/test; `SmileIdKycProviderStub` is a clearly marked, unimplemented slot — vendor API fields are not guessed. Production refuses `KYC_PROVIDER=fake`.
5. **Bank name mismatch** → 422 `bank_account_name_mismatch`; the applicant can resubmit with `confirmNameMismatch: true`, stored with `nameMatch=false` for ops.
6. **Uploads** behind `StorageProvider` (shared): S3 via hand-written SigV4 query presigning (no AWS SDK; verified against the AWS documentation vector) and a local-disk adapter with HMAC-signed `/v1/uploads/content` URLs. Policy per purpose (MIME + size), magic-byte sniffing on PUT and before any step uses a file; all files private; ops get 5-minute signed GET URLs (audited).
7. **Field encryption**: AES-256-GCM, random IV, column+row context as AAD, envelope `v1.<kid>.<iv>.<tag>.<ct>`; keyring from `FIELD_ENCRYPTION_KEYS` for rotation. Used for NIN, bank account numbers, guarantor phone, vendor owner ID number, TOTP secrets.
8. **Audit log** append-only by DB triggers (UPDATE/DELETE/TRUNCATE raise) + revoked privileges, like the ledger. `AuditService.record(entry, tx?)` lets modules write the entry in the same transaction as the change.
9. **Admin 2FA**: RFC 6238 TOTP implemented with `node:crypto` (no dependency; tested with RFC 6238/4226 vectors). Enrol → confirm → verify returns a random session token (stored hashed in Redis, TTL `ADMIN_2FA_SESSION_TTL_SECONDS`). `AdminTwoFactorGuard` requires header `x-admin-2fa` bound to the caller for support/ops/finance/super_admin. Replay protection: each time step is accepted once per user (atomic `last_used_step` CAS); 5 attempts / 5 min.
   **Admin web usage:** after OTP sign-in, the Next.js admin BFF calls `/v1/admin/2fa/verify` and stores the 2FA token in an httpOnly, Secure, SameSite=Strict cookie alongside the session; its server-side fetch adds `x-admin-2fa` (SDK option `adminTwoFactorToken`). On 403 `two_factor_required` the UI routes to the TOTP prompt.
10. **Feature flags** table + `FeatureFlags.isEnabled(key, fallback)`; GET/PUT `/v1/admin/feature-flags` (super_admin, 2FA, audited). Flags `onboarding.rider_applications` / `onboarding.vendor_applications` gate new applications.

## Consequences

- Approval is not one DB transaction across contexts. Ordering: idempotent role grant / catalog transitions first, then application status + audit + event atomically; retries are safe.
- Images are not re-encoded yet (DEBT). Existing admin routes (pricing `/v1/admin/*`, catalog go-live) do not yet require the 2FA guard (DEBT; adding it would break current clients/tests).
