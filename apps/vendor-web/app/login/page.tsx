'use client';

import type { OtpRequestResponse } from '@delyva/contracts';
import { StorefrontIcon, WifiSlashIcon } from '@delyva/icons/web';
import { ApiError } from '@delyva/sdk';
import { Button, OfflineBanner, TextField } from '@delyva/ui-web';
import { type SyntheticEvent, type ReactNode, useEffect, useState } from 'react';
import { postJson } from '../../lib/client/api';
import { useOnline } from '../../lib/client/providers';
import { type MessageKey, t } from '../../lib/i18n';
import { normaliseNigerianPhone } from '../../lib/phone';

const OTP_ERRORS: Partial<Record<string, MessageKey>> = {
  otp_invalid: 'login.otpInvalid',
  otp_expired: 'login.otpExpired',
  otp_attempts_exceeded: 'login.otpExpired',
  rate_limited: 'login.tooMany',
};

function errorText(err: unknown): string {
  const key = err instanceof ApiError ? OTP_ERRORS[err.problem.code] : undefined;
  return t(key ?? 'common.error');
}

/** Phone + OTP sign-in. Tokens are set as httpOnly cookies by the BFF; the page never sees them. */
export default function LoginPage(): ReactNode {
  const online = useOnline();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [intent] = useState(() => crypto.randomUUID());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const id = setTimeout(() => {
      setResendIn((s) => s - 1);
    }, 1_000);
    return () => {
      clearTimeout(id);
    };
  }, [resendIn]);

  async function send(e?: SyntheticEvent): Promise<void> {
    e?.preventDefault();
    const e164 = normaliseNigerianPhone(phone);
    if (!e164) {
      setError(t('login.phoneInvalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<OtpRequestResponse>(
        '/api/auth/otp/request',
        { phone: e164 },
        `${intent}-${String(attempt)}-${e164}`,
      );
      setSentTo(e164);
      setAttempt((n) => n + 1);
      setResendIn(res.resendAfterSeconds);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: SyntheticEvent): Promise<void> {
    e.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    try {
      await postJson('/api/auth/otp/verify', { phone: sentTo, code: code.trim() });
      window.location.assign('/orders');
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <>
      <OfflineBanner
        visible={!online}
        message={t('common.offline')}
        icon={<WifiSlashIcon size={20} />}
      />
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
        <header className="flex flex-col gap-2">
          <span className="text-accent-text">
            <StorefrontIcon size={32} />
          </span>
          <h1 className="font-heading text-h1 font-extrabold">{t('login.title')}</h1>
          <p className="text-body text-text-muted">{t('login.subtitle')}</p>
        </header>
        {sentTo === null ? (
          <form onSubmit={(e) => void send(e)} className="flex flex-col gap-4" noValidate>
            <TextField
              label={t('login.phone')}
              hint={t('login.phoneHint')}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              error={error}
              onChange={(e) => {
                setPhone(e.target.value);
              }}
            />
            <Button type="submit" variant="brand" size="lg" loading={busy}>
              {t('login.send')}
            </Button>
          </form>
        ) : (
          <form onSubmit={(e) => void verify(e)} className="flex flex-col gap-4" noValidate>
            <TextField
              label={t('login.code')}
              hint={t('login.codeHint', { phone: sentTo })}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              error={error}
              autoFocus
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''));
              }}
            />
            <Button
              type="submit"
              variant="brand"
              size="lg"
              loading={busy}
              disabled={code.length !== 6}
            >
              {t('login.verify')}
            </Button>
            <div className="flex flex-wrap justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={resendIn > 0 || busy}
                onClick={() => void send()}
              >
                {resendIn > 0 ? t('login.resendIn', { seconds: resendIn }) : t('login.resend')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSentTo(null);
                  setCode('');
                  setError(null);
                }}
              >
                {t('login.changePhone')}
              </Button>
            </div>
          </form>
        )}
      </main>
    </>
  );
}
