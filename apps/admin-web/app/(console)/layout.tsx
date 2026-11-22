import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
import { COOKIE } from '@/lib/server/cookies';

/**
 * Server gate for every console page: no refresh cookie → login; no 2FA cookie → TOTP step.
 * The API re-checks the role, the token and the 2FA session on every call.
 */
export default async function ConsoleLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const jar = await cookies();
  if (!jar.has(COOKIE.refresh)) redirect('/login');
  if (!jar.has(COOKIE.twoFactor)) redirect('/login?step=2fa');
  return <Shell>{children}</Shell>;
}
