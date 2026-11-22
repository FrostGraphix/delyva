'use client';
import {
  OtpRequestResponseSchema,
  TotpEnrolmentSchema,
  type TotpEnrolment,
} from '@delyva/contracts';
import { ShieldCheckIcon } from '@delyva/icons/web';
import { ApiError } from '@delyva/sdk';
import { Button, Card } from '@delyva/ui-web';
import { useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { bffPost } from '@/lib/client/api';
import { DisplayError, errorMessage } from '@/lib/client/errors';
import { loadSession } from '@/lib/client/session';
import { t } from '@/lib/i18n';
import { CodeStep, EnrolmentDetails, PhoneStep, ResendTimer } from './login-steps';

type Step = 'phone' | 'code' | 'totp' | 'enrol';

const RolesSchema = z.object({ roles: z.array(z.string()) });
const TwoFactorSchema = z.object({ expiresInSeconds: z.number() });

function codeOf(error: unknown): string | null {
  return error instanceof ApiError ? error.problem.code : null;
}

function useAction(): {
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  run: (fn: () => Promise<void>) => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>): void => {
    setBusy(true);
    setError(null);
    fn()
      .catch((e: unknown) => {
        setError(errorMessage(e));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return { busy, error, setError, run };
}

/** A01 login: phone → SMS OTP → TOTP verify (or first-time enrolment) → console. */
export function LoginFlow({ initialStep }: { readonly initialStep: 'phone' | 'totp' }): ReactNode {
  const [step, setStep] = useState<Step>(initialStep);
  const [phone, setPhone] = useState('');
  const [resendAfter, setResendAfter] = useState(30);
  const [enrolment, setEnrolment] = useState<TotpEnrolment | null>(null);
  const [needsEnrol, setNeedsEnrol] = useState(false);
  const action = useAction();

  useEffect(() => {
    void loadSession().then((s) => {
      if (initialStep === 'totp' && !s.signedIn) setStep('phone');
    });
  }, [initialStep]);

  const requestOtp = (value: string): void => {
    action.run(async () => {
      const res = await bffPost(
        '/bff/auth/otp/request',
        { phone: value },
        OtpRequestResponseSchema,
      );
      setPhone(value);
      setResendAfter(res.resendAfterSeconds);
      setStep('code');
    });
  };
  const verifyOtp = (code: string): void => {
    action.run(async () => {
      await bffPost('/bff/auth/otp/verify', { phone, code }, RolesSchema);
      setStep('totp');
    });
  };
  const finish = (): void => {
    window.location.assign('/overview');
  };
  const verifyTotp = (code: string): void => {
    action.run(async () => {
      try {
        await bffPost('/bff/auth/2fa/verify', { code }, TwoFactorSchema);
        finish();
      } catch (e) {
        if (codeOf(e) === 'two_factor_required') setNeedsEnrol(true);
        throw e;
      }
    });
  };
  const startEnrol = (): void => {
    action.run(async () => {
      try {
        setEnrolment(await bffPost('/bff/auth/2fa/enrolment', undefined, TotpEnrolmentSchema));
        setStep('enrol');
      } catch (e) {
        if (codeOf(e) === 'conflict') throw new DisplayError(t('login.alreadyEnrolled'), { cause: e });
        throw e;
      }
    });
  };
  const confirmEnrol = (code: string): void => {
    action.run(async () => {
      await bffPost('/bff/auth/2fa/confirm', { code }, TwoFactorSchema);
      finish();
    });
  };

  const twoFactor = step === 'totp' || step === 'enrol';
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <header className="flex flex-col gap-1 text-center">
        <span className="font-heading text-h2 font-extrabold text-accent-text">
          {t('app.name')}
        </span>
        <h1 className="font-heading text-h1 font-extrabold text-text">
          {twoFactor ? t('login.twoFactorTitle') : t('login.title')}
        </h1>
        <p className="text-body text-text-muted">
          {twoFactor ? t('login.twoFactorSubtitle') : t('login.subtitle')}
        </p>
      </header>
      <Card>
        {step === 'phone' ? (
          <PhoneStep busy={action.busy} error={action.error} onSubmit={requestOtp} />
        ) : null}
        {step === 'code' ? (
          <CodeStep
            id="otp"
            label={t('login.code')}
            submitLabel={t('login.verify')}
            busy={action.busy}
            error={action.error}
            onSubmit={verifyOtp}
          >
            <div className="flex items-center justify-between">
              <ResendTimer
                seconds={resendAfter}
                onResend={() => {
                  requestOtp(phone);
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStep('phone');
                }}
              >
                {t('login.changePhone')}
              </Button>
            </div>
          </CodeStep>
        ) : null}
        {step === 'totp' ? (
          <CodeStep
            id="totp"
            label={t('login.totp')}
            submitLabel={t('login.totpVerify')}
            busy={action.busy}
            error={action.error}
            onSubmit={verifyTotp}
          >
            <div className="flex flex-col items-start gap-2 border-t border-line pt-4">
              <p className="text-caption text-text-muted">{t('login.enrolPrompt')}</p>
              <Button variant={needsEnrol ? 'brand' : 'soft'} size="sm" onClick={startEnrol}>
                <ShieldCheckIcon size={16} />
                {t('login.enrolStart')}
              </Button>
            </div>
          </CodeStep>
        ) : null}
        {step === 'enrol' && enrolment ? (
          <div className="flex flex-col gap-4">
            <EnrolmentDetails enrolment={enrolment} />
            <CodeStep
              id="totp-confirm"
              label={t('login.totp')}
              submitLabel={t('login.enrolConfirm')}
              busy={action.busy}
              error={action.error}
              onSubmit={confirmEnrol}
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
