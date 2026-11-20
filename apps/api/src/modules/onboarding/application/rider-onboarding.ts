import {
  type BankAccountInput,
  type Quiz,
  type QuizResult,
  type QuizSubmission,
  RIDER_STEPS,
  type RiderApplication,
  type RiderGuarantor,
  type RiderIdentity,
  type RiderPersonalDetails,
  type RiderStep,
  type RiderVehicle,
} from '@delyva/contracts';
import {
  assertCanSaveStep,
  assertSubmittable,
  currentStep,
  statusAfterEdit,
  withCompleted,
} from '../domain/application-steps.js';
import { last4, personNameMatches } from '../domain/bank-name.js';
import { OnboardingError } from '../domain/onboarding-errors.js';
import { publicQuiz, scoreQuiz } from '../domain/quiz.js';
import { bankView, resolveBank } from './bank-account.js';
import {
  type ApplicationRepository,
  type BankResolver,
  type KycProvider,
  ONBOARDING_EVENTS,
  type OnboardingDeps,
  type PendingEvent,
  type RiderRecord,
  stepEvent,
} from './ports.js';
import type { UploadService } from './uploads.js';

/** Max KYC attempts before the applicant must contact support. */
export const MAX_KYC_ATTEMPTS = 3;
const FLAG = 'onboarding.rider_applications';
const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

/** Rider-facing view (masked PII). */
export function riderView(r: RiderRecord | null): RiderApplication {
  if (!r) {
    return {
      id: null,
      status: 'not_started',
      currentStep: 'personal_details',
      completedSteps: [],
      personalDetails: null,
      identity: null,
      vehicle: null,
      guarantor: null,
      bankAccount: null,
      quiz: null,
      submittedAt: null,
      reviewedAt: null,
      rejectionReason: null,
    };
  }
  return {
    id: r.id,
    status: r.status,
    currentStep: currentStep(RIDER_STEPS, r.completedSteps),
    completedSteps: r.completedSteps,
    personalDetails: r.personal,
    identity: r.identity
      ? {
          ninLast4: r.identity.ninLast4,
          kycStatus: r.identity.kycStatus,
          kycFailureReason: r.identity.kycFailureReason,
        }
      : null,
    vehicle: r.vehicle
      ? {
          vehicleType: r.vehicle.vehicleType,
          plateNumber: r.vehicle.plateNumber ?? null,
          licenceExpiry: r.vehicle.licenceExpiry ?? null,
        }
      : null,
    guarantor: r.guarantor
      ? {
          fullName: r.guarantor.fullName,
          relationship: r.guarantor.relationship,
          phoneLast4: r.guarantor.phoneLast4,
        }
      : null,
    bankAccount: bankView(r.bank),
    quiz: r.quiz,
    submittedAt: iso(r.submittedAt),
    reviewedAt: iso(r.reviewedAt),
    rejectionReason: r.rejectionReason,
  };
}

/**
 * Rider onboarding (CLAUDE.md → Onboarding → Rider). Progress is saved at every step; steps are
 * strictly ordered and resumable; each completion emits `onboarding.step.completed`.
 */
export class RiderOnboarding {
  /** @param deps collaborators */
  constructor(
    private readonly deps: OnboardingDeps & {
      repo: ApplicationRepository<RiderRecord>;
      uploads: UploadService;
      kyc: KycProvider;
      bank: BankResolver;
    },
  ) {}

  /** The caller's application (or a not-started view). */
  async get(userId: string): Promise<RiderApplication> {
    return riderView(await this.deps.repo.findByUser(userId));
  }

  /** Funnel analytics: step shown. */
  async recordView(userId: string, step: string): Promise<void> {
    if (!(RIDER_STEPS as readonly string[]).includes(step))
      throw new OnboardingError('validation_failed', 'Unknown rider step.');
    const r = await this.ensure(userId);
    await this.deps.repo.appendEvents([stepEvent('rider', r.id, step, true)]);
  }

  /** Step 1. */
  savePersonalDetails(userId: string, body: RiderPersonalDetails): Promise<RiderApplication> {
    const age = ageOn(body.dateOfBirth, this.deps.clock.now());
    if (age < 18)
      throw new OnboardingError('validation_failed', 'Riders must be at least 18 years old.');
    return this.step(userId, 'personal_details', (r) => ({ ...r, personal: body }));
  }

  /** Step 2: NIN + selfie liveness via the KYC provider. Failures keep the step incomplete. */
  async saveIdentity(userId: string, body: RiderIdentity): Promise<RiderApplication> {
    const r = await this.ensure(userId);
    assertCanSaveStep(RIDER_STEPS, r, 'identity');
    const attempts = (r.identity?.kycAttempts ?? 0) + 1;
    if (attempts > MAX_KYC_ATTEMPTS)
      throw new OnboardingError('rate_limited', 'Too many verification attempts; contact support.');
    const selfie = await this.deps.uploads.read(userId, body.selfieUploadId, ['selfie']);
    const p = r.personal;
    if (!p) throw new OnboardingError('conflict', 'Complete the personal_details step first.');
    const result = await this.deps.kyc.verifyIdentity({
      reference: `${r.id}:${String(attempts)}`,
      nin: body.nin,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      selfie,
    });
    const identity = {
      ninCiphertext: this.deps.cipher.encrypt(body.nin, `rider_applications.nin:${r.id}`),
      ninLast4: last4(body.nin),
      selfieUploadId: body.selfieUploadId,
      kycStatus: result.outcome,
      kycReference: result.providerReference,
      kycFailureReason: result.reason,
      kycAttempts: attempts,
    };
    const verified = result.outcome === 'verified';
    await this.persist(
      {
        ...r,
        identity,
        status: statusAfterEdit(r.status),
        completedSteps: verified
          ? withCompleted(RIDER_STEPS, r.completedSteps, 'identity')
          : r.completedSteps.filter((s) => s !== 'identity'),
      },
      verified ? [stepEvent('rider', r.id, 'identity', false)] : [],
    );
    if (!verified)
      throw new OnboardingError(
        'kyc_verification_failed',
        result.reason ?? 'Identity verification failed.',
      );
    return this.get(userId);
  }

  /** Step 3. */
  async saveVehicle(userId: string, body: RiderVehicle): Promise<RiderApplication> {
    if (body.licenceUploadId)
      await this.deps.uploads.requireUploaded(userId, body.licenceUploadId, ['drivers_licence']);
    await this.deps.uploads.requireUploaded(userId, body.vehiclePhotoUploadId, ['vehicle_photo']);
    return this.step(userId, 'vehicle', (r) => ({ ...r, vehicle: body }));
  }

  /** Step 4 (guarantor phone encrypted at rest). */
  saveGuarantor(userId: string, body: RiderGuarantor): Promise<RiderApplication> {
    return this.step(userId, 'guarantor', (r) => ({
      ...r,
      guarantor: {
        fullName: body.fullName,
        relationship: body.relationship,
        phoneLast4: last4(body.phone),
        phoneCiphertext: this.deps.cipher.encrypt(
          body.phone,
          `rider_applications.guarantor_phone:${r.id}`,
        ),
      },
    }));
  }

  /** Step 5: account resolved by name through payments. */
  async saveBankAccount(userId: string, body: BankAccountInput): Promise<RiderApplication> {
    const r = await this.ensure(userId);
    assertCanSaveStep(RIDER_STEPS, r, 'bank_account');
    const p = r.personal;
    if (!p) throw new OnboardingError('conflict', 'Complete the personal_details step first.');
    const bank = await resolveBank(
      body,
      this.deps.bank,
      this.deps.cipher,
      `rider_applications.bank_account:${r.id}`,
      (name) => personNameMatches(p, name),
    );
    return this.step(userId, 'bank_account', (x) => ({ ...x, bank }));
  }

  /** Quiz questions without answers. */
  quiz(): Quiz {
    return publicQuiz();
  }

  /** Step 6: server-scored quiz; only a pass completes the step. */
  async submitQuiz(userId: string, body: QuizSubmission): Promise<QuizResult> {
    const r = await this.ensure(userId);
    assertCanSaveStep(RIDER_STEPS, r, 'training_quiz');
    const score = scoreQuiz(body.answers);
    const attempts = (r.quiz?.attempts ?? 0) + 1;
    const passedBefore = r.quiz?.passed === true;
    const quiz = {
      attempts,
      scorePercent: score.scorePercent,
      passed: score.passed || passedBefore,
    };
    await this.persist(
      {
        ...r,
        quiz,
        status: statusAfterEdit(r.status),
        completedSteps: quiz.passed
          ? withCompleted(RIDER_STEPS, r.completedSteps, 'training_quiz')
          : r.completedSteps,
      },
      score.passed ? [stepEvent('rider', r.id, 'training_quiz', false)] : [],
    );
    return { ...score, attempts };
  }

  /** Submits for ops review. */
  async submit(userId: string): Promise<RiderApplication> {
    const r = await this.deps.repo.findByUser(userId);
    if (!r) throw new OnboardingError('conflict', 'Start your application first.');
    assertSubmittable(RIDER_STEPS, r);
    if (r.identity?.kycStatus !== 'verified')
      throw new OnboardingError('conflict', 'Identity is not verified.');
    await this.persist(
      { ...r, status: 'pending_review', submittedAt: this.deps.clock.now(), rejectionReason: null },
      [
        {
          type: ONBOARDING_EVENTS.submitted,
          payload: { kind: 'rider', applicationId: r.id, userId, vendorId: null },
        },
      ],
    );
    return this.get(userId);
  }

  private async step(
    userId: string,
    step: RiderStep,
    apply: (r: RiderRecord) => RiderRecord,
  ): Promise<RiderApplication> {
    const r = await this.ensure(userId);
    assertCanSaveStep(RIDER_STEPS, r, step);
    const next = apply(r);
    await this.persist(
      {
        ...next,
        status: statusAfterEdit(r.status),
        completedSteps: withCompleted(RIDER_STEPS, r.completedSteps, step),
      },
      [stepEvent('rider', r.id, step, false)],
    );
    return this.get(userId);
  }

  private async persist(r: RiderRecord, events: readonly PendingEvent[]): Promise<void> {
    if (!(await this.deps.repo.save(r, events))) {
      throw new OnboardingError('conflict', 'The application changed concurrently; retry.');
    }
  }

  private async ensure(userId: string): Promise<RiderRecord> {
    const existing = await this.deps.repo.findByUser(userId);
    if (existing) return existing;
    if (!(await this.deps.flags.isEnabled(FLAG, true))) {
      throw new OnboardingError('forbidden', 'Rider applications are paused right now.');
    }
    return this.deps.repo.create({
      id: this.deps.clock.uuid(),
      userId,
      status: 'in_progress',
      completedSteps: [],
      version: 0,
      personal: null,
      identity: null,
      vehicle: null,
      guarantor: null,
      bank: null,
      quiz: null,
      submittedAt: null,
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    });
  }
}

/** Whole years between an ISO date and `now`. */
export function ageOn(isoDate: string, now: Date): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}
