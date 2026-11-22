import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '../../components/app-shell';
import { COOKIE } from '../../lib/server/cookies';

/**
 * Signed-in area. The server only checks that a session cookie exists (fast redirect for
 * signed-out visitors); every API call is still authorized by the API itself.
 */
export default async function SignedInLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const jar = await cookies();
  if (!jar.get(COOKIE.refresh)) redirect('/login');
  return <AppShell>{children}</AppShell>;
}
