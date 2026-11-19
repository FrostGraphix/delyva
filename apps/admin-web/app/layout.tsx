import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

/** Page metadata. */
export const metadata: Metadata = {
  title: 'Delyva Admin',
  description: 'Delyva — Delivered Your Way.',
};

/** Root layout. */
export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="en-NG">
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
