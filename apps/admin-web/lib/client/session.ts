'use client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import { setCsrfToken } from './api';

const SessionSchema = z.object({
  signedIn: z.boolean(),
  roles: z.array(z.string()),
  twoFactor: z.boolean(),
  csrf: z.string(),
});

/** The page's view of the admin session (no tokens except the CSRF value). */
export type Session = z.infer<typeof SessionSchema>;

/** Query key of the session. */
export const SESSION_KEY = ['bff', 'session'] as const;

/** Loads the session and arms the CSRF header for every later mutation. */
export async function loadSession(): Promise<Session> {
  const res = await fetch('/bff/auth/session', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`session ${String(res.status)}`);
  const session = SessionSchema.parse(await res.json());
  setCsrfToken(session.csrf);
  return session;
}

/** Session query (refetched every 5 minutes so the BFF refreshes tokens before they lapse). */
export function useSession(): UseQueryResult<Session> {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: loadSession,
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
}
