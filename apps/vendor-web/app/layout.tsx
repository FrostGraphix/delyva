import { ACCENT_COOKIE, parseAccent } from '@delyva/ui-web';
import { cookies } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '../lib/client/providers';
import { t } from '../lib/i18n';
import './globals.css';

/** Page metadata. */
export const metadata: Metadata = {
  title: t('app.name'),
  description: 'Delyva — Delivered Your Way.',
};

/** Viewport: tablet kitchen screens and desktops; allow zoom for accessibility. */
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/** Root layout: sets `data-accent` from the `dl_accent` UI-preference cookie. */
export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): Promise<ReactNode> {
  // Server-rendered so the chosen accent paints on first byte (no flash, no inline script / CSP change).
  const accent = parseAccent((await cookies()).get(ACCENT_COOKIE)?.value);
  return (
    <html lang="en-NG" data-accent={accent}>
      <body className="min-h-dvh bg-bg font-sans text-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
