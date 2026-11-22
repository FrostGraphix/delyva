'use client';
import { NigeriaPhoneSchema, OtpCodeSchema, type TotpEnrolment } from '@delyva/contracts';
import { Button, TextField } from '@delyva/ui-web';
import { useEffect, useState, type ReactNode } from 'react';
import { t } from '@/lib/i18n';

/** Shared props of a login step. */
export interface StepProps {
  readonly busy: boolean;
  readonly error: string | null;
}

function submit(handler: () => void): (e: { preventDefault: () => void }) => void {
  return (e) => {
    e.preventDefault();
    handler();
  };
}

/** Phone entry. */
export function PhoneStep(
  props: StepProps & { readonly onSubmit: (phone: string) => void },
): ReactNode {
  const [phone, setPhone] = useState('+234');
  const [touched, setTouched] = useState(false);
  const valid = NigeriaPhoneSchema.safeParse(phone).success;
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={submit(() => {
        setTouched(true);
        if (valid) props.onSubmit(phone);
      })}
    >
      <TextField
        id="phone"
        label={t('login.phone')}
        hint={t('login.phoneHint')}
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={phone}
        error={touched && !valid ? t('login.phoneInvalid') : props.error}
        onChange={(e) => {
          setPhone(e.target.value.trim());
        }}
      />
      <Button type="submit" size="lg" loading={props.busy}>
        {t('login.sendCode')}
      </Button>
    </form>
  );
}

/** Six-digit code entry (SMS OTP or TOTP). */
export function CodeStep(
  props: StepProps & {
    readonly id: string;
    readonly label: string;
    readonly submitLabel: string;
    readonly autoComplete?: 'one-time-code';
    readonly onSubmit: (code: string) => void;
    readonly children?: ReactNode;
  },
): ReactNode {
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = OtpCodeSchema.safeParse(code).success;
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={submit(() => {
        setTouched(true);
        if (valid) props.onSubmit(code);
      })}
    >
      <TextField
        id={props.id}
        label={props.label}
        inputMode="numeric"
        autoComplete={props.autoComplete ?? 'one-time-code'}
        maxLength={6}
        value={code}
        error={touched && !valid ? t('login.codeInvalid') : props.error}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, ''));
        }}
      />
      <Button type="submit" size="lg" loading={props.busy}>
        {props.submitLabel}
      </Button>
      {props.children}
    </form>
  );
}

/** Resend control with a countdown. */
export function ResendTimer({
  seconds,
  onResend,
}: {
  readonly seconds: number;
  readonly onResend: () => void;
}): ReactNode {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const timer = setInterval(() => {
      setLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [seconds]);
  return left > 0 ? (
    <p className="text-caption text-text-muted" aria-live="polite">
      {t('login.resendIn', { seconds: left })}
    </p>
  ) : (
    <Button variant="ghost" size="sm" onClick={onResend}>
      {t('login.resend')}
    </Button>
  );
}

/** Shows the TOTP setup key once. */
export function EnrolmentDetails({ enrolment }: { readonly enrolment: TotpEnrolment }): ReactNode {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-bg p-4">
      <p className="text-caption text-text-muted">{t('login.enrolSteps')}</p>
      <dl className="flex flex-col gap-2 text-caption">
        <dt className="font-semibold text-text">{t('login.enrolKey')}</dt>
        <dd>
          <code data-testid="totp-secret" className="font-mono text-body break-all text-text">
            {enrolment.secret}
          </code>
        </dd>
        <dt className="font-semibold text-text">{t('login.enrolUri')}</dt>
        <dd className="break-all text-text-muted">{enrolment.otpauthUri}</dd>
      </dl>
    </div>
  );
}
