import { createHash } from 'node:crypto';
import type { KycProvider, KycResult } from '../application/ports.js';

/**
 * Deterministic fake KYC provider for development and tests (refused in production by env
 * validation). Rules: NIN starting `000` → NIN not found; NIN ending `99` → selfie liveness
 * failed; NIN ending `98` → manual review; otherwise verified.
 */
export class FakeKycProvider implements KycProvider {
  /** @inheritdoc */
  verifyIdentity(input: Parameters<KycProvider['verifyIdentity']>[0]): Promise<KycResult> {
    const providerReference = `fake-kyc-${createHash('sha256').update(input.reference).digest('hex').slice(0, 16)}`;
    if (input.nin.startsWith('000')) {
      return Promise.resolve({
        outcome: 'failed',
        providerReference,
        reason: 'NIN could not be found.',
      });
    }
    if (input.nin.endsWith('99')) {
      return Promise.resolve({
        outcome: 'failed',
        providerReference,
        reason: 'Selfie liveness check failed; retake in good light.',
      });
    }
    if (input.nin.endsWith('98')) {
      return Promise.resolve({
        outcome: 'manual_review',
        providerReference,
        reason: 'Sent for manual review.',
      });
    }
    return Promise.resolve({ outcome: 'verified', providerReference, reason: null });
  }
}

/**
 * STUB — adapter slot for a real Nigerian KYC vendor (Smile ID, Dojah or Prembly: NIN lookup
 * + selfie liveness/face match). Intentionally NOT implemented: the vendor has not been chosen
 * and its API fields must come from its official documentation/sandbox, not be guessed.
 * DEBT(kyc): implement against the chosen vendor's sandbox (timeouts, retries, breaker,
 * webhook for async results) — required before production (env refuses KYC_PROVIDER=fake).
 */
export class SmileIdKycProviderStub implements KycProvider {
  /** @inheritdoc */
  verifyIdentity(): Promise<KycResult> {
    return Promise.reject(new Error('KYC provider smile_id is a stub and not implemented yet'));
  }
}
