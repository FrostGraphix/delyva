import { ScrollIcon } from '@delyva/icons/web';
import { Alert, Card, EmptyState } from '@delyva/ui-web';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { t } from '@/lib/i18n';

/**
 * Audit log view.
 * DEBT(admin): no read endpoint for `audit_log` — the API only writes it — add
 * `GET /v1/admin/audit-log` (finance/super_admin, cursor-paged) and render it with DataTable.
 */
export default function AuditPage(): ReactNode {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />
      <Alert tone="info" title={t('common.debtTitle')}>
        {t('audit.debt')}
      </Alert>
      <Card>
        <EmptyState illustration={<ScrollIcon size={32} />} title={t('common.needsEndpoint')} />
      </Card>
    </div>
  );
}
