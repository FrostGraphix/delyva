'use client';
import { Alert } from '@delyva/ui-web';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { useSession } from '@/lib/client/session';
import { t } from '@/lib/i18n';
import { canAccess } from '@/lib/roles';
import { FeeRules } from './fee-rules';
import { Promos } from './promos';
import { SurgeRules } from './surge-rules';

/** A08/A09 · Pricing (fee rules, surge) and promotions. */
export default function PricingPage(): ReactNode {
  const session = useSession();
  const allowed = canAccess('pricing', session.data?.roles ?? []);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('pricing.title')} subtitle={t('pricing.subtitle')} />
      {session.isSuccess && !allowed ? (
        <Alert tone="warning" title={t('common.noAccessTitle')}>
          {t('common.noAccessBody')}
        </Alert>
      ) : (
        <>
          <FeeRules />
          <SurgeRules />
          <Promos />
        </>
      )}
    </div>
  );
}
