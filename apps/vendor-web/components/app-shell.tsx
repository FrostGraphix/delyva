'use client';

import {
  GearIcon,
  ListIcon,
  ReceiptIcon,
  SignOutIcon,
  StorefrontIcon,
  ClockIcon,
  WalletIcon,
  WifiSlashIcon,
} from '@delyva/icons/web';
import { ErrorState, OfflineBanner, SkeletonList } from '@delyva/ui-web';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { isUnauthorized, postJson } from '../lib/client/api';
import { useMyVendors, useOnline, useVendor, VendorProvider } from '../lib/client/providers';
import { applyStoredTheme } from '../lib/client/theme';
import { type MessageKey, t } from '../lib/i18n';

const NAV: readonly { href: string; label: MessageKey; Icon: typeof ListIcon }[] = [
  { href: '/orders', label: 'nav.orders', Icon: ReceiptIcon },
  { href: '/menu', label: 'nav.menu', Icon: ListIcon },
  { href: '/hours', label: 'nav.hours', Icon: ClockIcon },
  { href: '/earnings', label: 'nav.earnings', Icon: WalletIcon },
  { href: '/settings', label: 'nav.settings', Icon: GearIcon },
];

/** Signs out through the BFF and returns to the login page. */
export async function signOut(): Promise<void> {
  await postJson('/api/auth/logout', {}).catch(() => undefined);
  window.location.assign('/login');
}

/** Signed-in chrome: loads the caller's vendors, routes non-vendors to onboarding. */
export function AppShell({ children }: { readonly children: ReactNode }): ReactNode {
  const vendors = useMyVendors();
  const router = useRouter();
  const path = usePathname();
  const online = useOnline();
  const onboarding = path.startsWith('/onboarding');
  const none = vendors.data?.length === 0;

  useEffect(applyStoredTheme, []);
  useEffect(() => {
    if (isUnauthorized(vendors.error)) router.replace('/login');
    else if (none && !onboarding) router.replace('/onboarding');
  }, [vendors.error, none, onboarding, router]);

  const banner = (
    <OfflineBanner
      visible={!online}
      message={t('common.offline')}
      icon={<WifiSlashIcon size={20} />}
    />
  );
  if (vendors.isPending) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <SkeletonList rows={4} label={t('common.loading')} />
      </main>
    );
  }
  if (vendors.isError) {
    return (
      <main className="mx-auto max-w-xl p-6">
        {banner}
        <ErrorState
          title={t('common.error')}
          action={{ label: t('common.retry'), onClick: () => void vendors.refetch() }}
        />
      </main>
    );
  }
  return (
    <VendorProvider vendors={vendors.data}>
      {banner}
      <div className="flex min-h-dvh flex-col md:flex-row">
        <SideNav hasVendor={!none} path={path} />
        <main id="main" className="flex-1 p-4 pb-24 md:p-6 md:pb-6">
          {none && !onboarding ? <SkeletonList label={t('common.loading')} /> : children}
        </main>
      </div>
    </VendorProvider>
  );
}

function SideNav({
  hasVendor,
  path,
}: {
  readonly hasVendor: boolean;
  readonly path: string;
}): ReactNode {
  const { vendor } = useVendor();
  const items = hasVendor
    ? NAV
    : [{ href: '/onboarding', label: 'nav.onboarding' as const, Icon: StorefrontIcon }];
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:static md:w-56 md:flex-col md:border-t-0 md:border-r md:p-3"
    >
      <p className="hidden px-3 py-4 font-heading text-body-l font-extrabold md:block">
        {vendor?.name ?? t('app.name')}
      </p>
      {items.map(({ href, label, Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-3 text-micro font-semibold focus-visible:outline-2 focus-visible:outline-primary md:flex-none md:flex-row md:justify-start md:gap-3 md:text-body ${active ? 'bg-accent-100 text-ink-900' : 'text-text-muted'}`}
          >
            <Icon size={24} />
            <span>{t(label)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => void signOut()}
        className="hidden min-h-12 items-center gap-3 rounded-lg px-3 text-body font-semibold text-text-muted focus-visible:outline-2 focus-visible:outline-primary md:mt-auto md:flex"
      >
        <SignOutIcon size={24} />
        {t('settings.logout')}
      </button>
    </nav>
  );
}
