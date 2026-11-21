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

/** Root layout. */
export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="en-NG">
      <body className="min-h-dvh bg-bg font-sans text-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
