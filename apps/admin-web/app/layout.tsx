import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { t } from '@/lib/i18n';
import { Providers } from './providers';
import './globals.css';

/** Page metadata. */
export const metadata: Metadata = {
  title: t('app.name'),
  description: t('app.tagline'),
  robots: { index: false, follow: false },
};

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
