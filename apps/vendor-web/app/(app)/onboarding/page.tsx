'use client';

import { VENDOR_STEPS, type VendorApplication, type VendorStep } from '@delyva/contracts';
import { CheckCircleIcon } from '@delyva/icons/web';
import { Button, ErrorState, SkeletonList, useToast } from '@delyva/ui-web';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { problemLines, STEP_COMPONENTS, StepError } from '../../../components/onboarding/steps';
import { browserClient } from '../../../lib/client/api';
import { APPLICATION_KEY, useApplication } from '../../../lib/client/application';
import { type MessageKey, t } from '../../../lib/i18n';

function firstOpenStep(app: VendorApplication): VendorStep | 'submit' {
  return VENDOR_STEPS.find((s) => !app.completedSteps.includes(s)) ?? 'submit';
}

/** Vendor onboarding wizard mirroring /v1/vendor-applications/me (progress saved at every step). */
export default function OnboardingPage(): ReactNode {
  const q = useApplication();
  const qc = useQueryClient();
  const router = useRouter();
  const [step, setStep] = useState<VendorStep | 'submit' | null>(null);
  const current = step ?? (q.data ? firstOpenStep(q.data) : null);

  useEffect(() => {
    if (q.data && ['pending_review', 'approved', 'rejected'].includes(q.data.status))
      router.replace('/onboarding/status');
  }, [q.data, router]);
  useEffect(() => {
    if (current && current !== 'submit')
      void browserClient()
        .recordVendorStepView(current)
        .catch(() => undefined);
  }, [current]);

  if (q.isPending || !current) return <SkeletonList rows={4} label={t('common.loading')} />;
  if (q.isError)
    return (
      <ErrorState
        title={t('onboarding.loadError')}
        action={{ label: t('common.retry'), onClick: () => void q.refetch() }}
      />
    );
  const app = q.data;
  const all = [...VENDOR_STEPS, 'submit'] as const;
  const index = all.indexOf(current);
  const onSaved = (next: VendorApplication): void => {
    qc.setQueryData(APPLICATION_KEY, next);
    setStep(firstOpenStep(next));
  };
  const Step = current === 'submit' ? null : STEP_COMPONENTS[current];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-h1 font-extrabold">{t('onboarding.title')}</h1>
        <p className="text-caption text-text-muted">
          {t('onboarding.step', { n: index + 1, total: all.length })}
        </p>
      </header>
      <ol aria-label={t('onboarding.title')} className="flex flex-wrap gap-2">
        {all.map((s) => {
          const done = s !== 'submit' && app.completedSteps.includes(s);
          return (
            <li key={s}>
              <button
                type="button"
                aria-current={s === current ? 'step' : undefined}
                onClick={() => {
                  setStep(s);
                }}
                className={`flex min-h-12 items-center gap-1 rounded-pill border px-4 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-primary ${s === current ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-text'}`}
              >
                {done ? <CheckCircleIcon size={16} accessibilityLabel="✓" /> : null}
                {t(`onboarding.step.${s}` as MessageKey)}
              </button>
            </li>
          );
        })}
      </ol>
      <section
        aria-labelledby="step-title"
        className="rounded-2xl border border-line bg-surface p-4 md:p-6"
      >
        <h2 id="step-title" className="mb-4 font-heading text-h2 font-bold">
          {t(`onboarding.step.${current}` as MessageKey)}
        </h2>
        {Step ? <Step key={current} app={app} onSaved={onSaved} /> : <SubmitStep app={app} />}
      </section>
    </div>
  );
}

function SubmitStep({ app }: { readonly app: VendorApplication }): ReactNode {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; lines: string[] } | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const complete = VENDOR_STEPS.every((s) => app.completedSteps.includes(s));
  return (
    <div className="flex flex-col gap-4">
      {complete ? null : <p className="text-body text-text-muted">{t('onboarding.incomplete')}</p>}
      <StepError error={error} />
      <Button
        variant="brand"
        size="lg"
        loading={busy}
        disabled={!complete}
        onClick={() => {
          setBusy(true);
          browserClient()
            .submitVendorApplication(key)
            .then(
              (next) => {
                qc.setQueryData(APPLICATION_KEY, next);
                toast.show(t('onboarding.submitted'));
                router.push('/onboarding/status');
              },
              (err: unknown) => {
                setError(problemLines(err));
                setBusy(false);
              },
            );
        }}
      >
        {t('onboarding.submit')}
      </Button>
    </div>
  );
}
