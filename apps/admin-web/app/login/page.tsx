import type { ReactNode } from 'react';
import { LoginFlow } from './login-flow';

/** A01 · Login + 2FA. */
export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const { step } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <LoginFlow initialStep={step === '2fa' ? 'totp' : 'phone'} />
    </main>
  );
}
