import { OnboardingError } from './onboarding-errors.js';

/** Persisted application status (`not_started` is view-only). */
export type StoredStatus = 'in_progress' | 'pending_review' | 'approved' | 'rejected';

/** Minimal state the step policy needs. */
export interface StepState<S extends string> {
  readonly status: StoredStatus;
  readonly completedSteps: readonly S[];
}

/** Statuses in which the applicant may still edit steps. */
const EDITABLE: readonly StoredStatus[] = ['in_progress', 'rejected'];

/**
 * Asserts `step` may be saved: the application is editable (a rejected application can be
 * corrected and resubmitted) and every earlier step is complete (steps are strictly ordered;
 * re-saving a completed step is allowed so applicants can fix mistakes).
 * @throws OnboardingError conflict
 */
export function assertCanSaveStep<S extends string>(
  order: readonly S[],
  state: StepState<S>,
  step: S,
): void {
  if (!EDITABLE.includes(state.status)) {
    throw new OnboardingError(
      'conflict',
      `The application is ${state.status} and cannot be edited.`,
    );
  }
  const idx = order.indexOf(step);
  const missing = order.slice(0, idx).find((s) => !state.completedSteps.includes(s));
  if (missing) throw new OnboardingError('conflict', `Complete the ${missing} step first.`);
}

/** Completed steps after finishing `step`, de-duplicated and in canonical order. */
export function withCompleted<S extends string>(
  order: readonly S[],
  completed: readonly S[],
  step: S,
): S[] {
  const set = new Set<S>([...completed, step]);
  return order.filter((s) => set.has(s));
}

/** First incomplete step (where to resume), or null when all are complete. */
export function currentStep<S extends string>(
  order: readonly S[],
  completed: readonly S[],
): S | null {
  return order.find((s) => !completed.includes(s)) ?? null;
}

/** Status after any successful edit: a rejected application goes back to in progress. */
export function statusAfterEdit(status: StoredStatus): StoredStatus {
  return status === 'rejected' ? 'in_progress' : status;
}

/** Asserts the application can be submitted for review. @throws OnboardingError conflict */
export function assertSubmittable<S extends string>(
  order: readonly S[],
  state: StepState<S>,
): void {
  if (!EDITABLE.includes(state.status)) {
    throw new OnboardingError('conflict', `The application is already ${state.status}.`);
  }
  const missing = currentStep(order, state.completedSteps);
  if (missing)
    throw new OnboardingError('conflict', `Complete the ${missing} step before submitting.`);
}

/** Asserts an ops decision is possible (only `pending_review`). @throws OnboardingError conflict */
export function assertReviewable(status: StoredStatus): void {
  if (status !== 'pending_review') {
    throw new OnboardingError(
      'conflict',
      `Only applications pending review can be decided (is ${status}).`,
    );
  }
}
