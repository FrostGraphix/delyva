import type { RiderApplication, RiderStep } from '@delyva/contracts';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import type { z } from 'zod';
import { api } from '../api/client';
import { problemCode } from '../api/errors';
import { t } from '../i18n';
import { routeForApplication } from './routes';

/** Field → message map from a Zod error (first issue per top-level field). */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_form');
    out[key] ??= issue.message;
  }
  return out;
}

/** Records the funnel view once per mount (PostHog `onboarding_step_viewed` via the API). */
export function useStepView(step: RiderStep): void {
  useEffect(() => {
    void api.recordRiderStepView(step).catch(() => undefined);
  }, [step]);
}

/** Validation + save state for one onboarding form. */
export interface StepForm {
  readonly errors: Record<string, string>;
  readonly formError: string | null;
  readonly saving: boolean;
  /** Validates with the shared schema, saves, then navigates to the next step. */
  submit<S extends z.ZodType>(
    schema: S,
    values: unknown,
    save: (body: z.infer<S>) => Promise<RiderApplication>,
  ): void;
  setFormError(message: string | null): void;
}

/** Shared form behaviour for the rider application steps. */
export function useStepForm(onProblem?: (code: string | null) => string | null): StepForm {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit: StepForm['submit'] = (schema, values, save) => {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFormError(t('onb.invalid'));
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    save(parsed.data)
      .then((app) => {
        router.replace(routeForApplication(app));
      })
      .catch((err: unknown) => {
        setFormError(onProblem?.(problemCode(err)) ?? t('common.errorBody'));
      })
      .finally(() => {
        setSaving(false);
      });
  };
  return { errors, formError, saving, submit, setFormError };
}
