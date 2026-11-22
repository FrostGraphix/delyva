import type { RiderApplication, RiderStep } from '@delyva/contracts';
import { RIDER_STEPS } from '@delyva/contracts';

/** Screen route of each application step. */
export const STEP_ROUTE = {
  personal_details: '/onboarding/personal',
  identity: '/onboarding/identity',
  vehicle: '/onboarding/vehicle',
  guarantor: '/onboarding/guarantor',
  bank_account: '/onboarding/bank',
  training_quiz: '/onboarding/quiz',
} as const satisfies Record<RiderStep, string>;

/** Any onboarding route. */
export type OnboardingRoute =
  (typeof STEP_ROUTE)[RiderStep] | '/onboarding/review' | '/onboarding/status';

/**
 * Where to resume an application: status screen once submitted, the first incomplete step
 * otherwise, and the review screen when every step is done.
 */
export function routeForApplication(app: RiderApplication): OnboardingRoute {
  if (app.status === 'pending_review' || app.status === 'approved' || app.status === 'rejected') {
    return '/onboarding/status';
  }
  const next = RIDER_STEPS.find((s) => !app.completedSteps.includes(s));
  return next ? STEP_ROUTE[next] : '/onboarding/review';
}

/** 1-based position of a step (progress header). */
export function stepNumber(step: RiderStep): number {
  return RIDER_STEPS.indexOf(step) + 1;
}

/** Number of steps before submit. */
export const TOTAL_STEPS = RIDER_STEPS.length;
