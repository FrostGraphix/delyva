'use client';
import {
  ChartBarIcon,
  FlagIcon,
  MapTrifoldIcon,
  MopedIcon,
  ScrollIcon,
  SignOutIcon,
  StorefrontIcon,
  TagIcon,
  WifiSlashIcon,
} from '@delyva/icons/web';
import { Alert, Skeleton } from '@delyva/ui-web';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ComponentType, type ReactNode } from 'react';
import { z } from 'zod';
import { bffPost } from '@/lib/client/api';
import { useSession } from '@/lib/client/session';
import { useOnline } from '@/lib/client/use-online';
import { t, type MessageKey } from '@/lib/i18n';
import { canAccess, type Section } from '@/lib/roles';

interface NavItem {
  readonly href: string;
  readonly label: MessageKey;
  readonly section: Section;
  readonly Icon: ComponentType<{ size?: 20 }>;
}

const NAV: readonly NavItem[] = [
  { href: '/overview', label: 'nav.overview', section: 'overview', Icon: ChartBarIcon },
  { href: '/live', label: 'nav.live', section: 'live', Icon: MapTrifoldIcon },
  { href: '/riders', label: 'nav.riders', section: 'riders', Icon: MopedIcon },
  { href: '/merchants', label: 'nav.merchants', section: 'merchants', Icon: StorefrontIcon },
  { href: '/pricing', label: 'nav.pricing', section: 'pricing', Icon: TagIcon },
  { href: '/flags', label: 'nav.flags', section: 'flags', Icon: FlagIcon },
  { href: '/audit', label: 'nav.audit', section: 'audit', Icon: ScrollIcon },
];

function NavLink({
  item,
  active,
}: {
  readonly item: NavItem;
  readonly active: boolean;
}): ReactNode {
  const { Icon } = item;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-12 items-center gap-3 rounded-md px-3 text-body font-semibold focus-visible:outline-2 focus-visible:outline-primary ${
        active ? 'bg-primary text-on-primary' : 'text-text-muted hover:bg-bg hover:text-text'
      }`}
    >
      <Icon size={20} />
      {t(item.label)}
    </Link>
  );
}

function SignOut(): ReactNode {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void bffPost('/bff/auth/logout', undefined, z.unknown()).finally(() => {
          window.location.assign('/login');
        });
      }}
      className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-body font-semibold text-text-muted hover:bg-bg hover:text-text focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
    >
      <SignOutIcon size={20} />
      {t('nav.signOut')}
    </button>
  );
}

/** Console chrome: 248 px sidebar (role-filtered nav), offline banner and main region. */
export function Shell({ children }: { readonly children: ReactNode }): ReactNode {
  const pathname = usePathname();
  const session = useSession();
  const online = useOnline();
  const roles = session.data?.roles ?? [];
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-3">
        {t('nav.skip')}
      </a>
      <aside className="sticky top-0 flex h-dvh w-62 shrink-0 flex-col gap-6 border-r border-line bg-surface p-4">
        <div className="flex flex-col px-3 pt-2">
          <span className="font-heading text-h2 font-extrabold text-text">{t('app.name')}</span>
          <span className="text-micro text-text-muted">{t('app.tagline')}</span>
        </div>
        <nav aria-label={t('nav.label')} className="flex flex-1 flex-col gap-1">
          {session.isPending ? (
            <Skeleton label={t('common.loading', { what: t('nav.label') })} lines={5} />
          ) : (
            NAV.filter((item) => canAccess(item.section, roles)).map((item) => (
              <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
            ))
          )}
        </nav>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <span className="px-3 text-micro text-text-muted">
            {t('nav.signedInAs', { roles: roles.join(', ') })}
          </span>
          <SignOut />
        </div>
      </aside>
      <main id="main" className="flex min-w-0 flex-1 flex-col gap-6 p-8">
        {online ? null : (
          <Alert
            tone="warning"
            title={t('common.offlineTitle')}
            action={<WifiSlashIcon size={24} />}
          >
            {t('common.offlineBody')}
          </Alert>
        )}
        {children}
      </main>
    </div>
  );
}
