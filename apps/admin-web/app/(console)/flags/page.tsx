'use client';
import { FeatureFlagKeySchema, type FeatureFlag } from '@delyva/contracts';
import { Alert, Badge, Button, Card, Checkbox, TextField } from '@delyva/ui-web';
import { useMemo, useState, type ReactNode } from 'react';
import { DataTable, columnsFor, type Columns } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { EmptyBlock, QueryView } from '@/components/query-view';
import { ReasonDialog } from '@/components/reason-dialog';
import { errorMessage } from '@/lib/client/errors';
import { useFlags, useUpsertFlag } from '@/lib/client/queries';
import { useSession } from '@/lib/client/session';
import { useToast } from '@/lib/client/toasts';
import { formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { canAccess } from '@/lib/roles';

interface Pending {
  readonly key: string;
  readonly enabled: boolean;
  readonly description?: string;
}

const col = columnsFor<FeatureFlag>();

function flagColumns(onToggle: (f: FeatureFlag) => void): Columns<FeatureFlag> {
  return col.columns([
    col.accessor('key', {
      header: () => t('flags.col.key'),
      cell: (c) => <code className="font-semibold">{c.getValue()}</code>,
    }),
    col.accessor('description', { header: () => t('flags.col.description') }),
    col.accessor('enabled', {
      header: () => t('flags.col.state'),
      cell: (c) => (
        <Badge tone={c.getValue() ? 'success' : 'neutral'}>
          {t(c.getValue() ? 'flags.enabled' : 'flags.disabled')}
        </Badge>
      ),
    }),
    col.accessor('updatedAt', {
      header: () => t('flags.col.updated'),
      cell: (c) => formatDateTime(c.getValue()),
    }),
    col.display({
      id: 'toggle',
      header: () => t('flags.col.state'),
      cell: (c) => (
        <Button
          size="sm"
          variant="soft"
          aria-label={t('flags.toggleTitle', {
            action: t(c.row.original.enabled ? 'flags.disable' : 'flags.enable'),
            key: c.row.original.key,
          })}
          onClick={() => {
            onToggle(c.row.original);
          }}
        >
          {t(c.row.original.enabled ? 'flags.disable' : 'flags.enable')}
        </Button>
      ),
    }),
  ]) as Columns<FeatureFlag>;
}

function NewFlag({ onSubmit }: { readonly onSubmit: (p: Pending) => void }): ReactNode {
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [touched, setTouched] = useState(false);
  const valid = FeatureFlagKeySchema.safeParse(key).success;
  return (
    <Card title={t('flags.new')}>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          id="flag-key"
          label={t('flags.key')}
          value={key}
          error={touched && !valid ? t('flags.keyInvalid') : null}
          onChange={(e) => {
            setKey(e.target.value.trim());
          }}
        />
        <TextField
          id="flag-description"
          label={t('flags.description')}
          value={description}
          maxLength={300}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </div>
      <Checkbox
        id="flag-enabled"
        label={t('flags.enabled')}
        checked={enabled}
        onChange={setEnabled}
      />
      <Button
        variant="brand"
        onClick={() => {
          setTouched(true);
          if (valid) onSubmit({ key, enabled, description });
        }}
      >
        {t('common.create')}
      </Button>
    </Card>
  );
}

/** Feature flags (super_admin): toggle and create, each with an audit reason. */
export default function FlagsPage(): ReactNode {
  const session = useSession();
  const allowed = canAccess('flags', session.data?.roles ?? []);
  const flags = useFlags(allowed);
  const upsert = useUpsertFlag();
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const columns = useMemo(
    () =>
      flagColumns((f) => {
        setPending({ key: f.key, enabled: !f.enabled });
      }),
    [],
  );
  if (session.isSuccess && !allowed) {
    return (
      <Alert tone="warning" title={t('common.noAccessTitle')}>
        {t('common.noAccessBody')}
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('flags.title')} subtitle={t('flags.subtitle')} />
      <Card>
        <QueryView
          query={flags}
          what={t('flags.title')}
          isEmpty={(d) => d.items.length === 0}
          empty={<EmptyBlock title={t('flags.empty')} body={t('flags.emptyBody')} />}
        >
          {(d) => (
            <DataTable
              caption={t('flags.title')}
              columns={columns}
              data={d.items}
              rowId={(f) => f.key}
            />
          )}
        </QueryView>
      </Card>
      <NewFlag onSubmit={setPending} />
      <ReasonDialog
        open={pending !== null}
        title={
          pending
            ? t('flags.toggleTitle', {
                action: t(pending.enabled ? 'flags.enable' : 'flags.disable'),
                key: pending.key,
              })
            : ''
        }
        confirmLabel={t('common.confirm')}
        busy={upsert.isPending}
        error={upsert.error ? errorMessage(upsert.error) : null}
        onClose={() => {
          setPending(null);
          upsert.reset();
        }}
        onConfirm={(reason) => {
          if (!pending) return;
          const { key, enabled, description } = pending;
          upsert.mutate(
            { key, enabled, reason, ...(description ? { description } : {}) },
            {
              onSuccess: () => {
                toast(
                  'success',
                  t('flags.saved', { key, state: t(enabled ? 'flags.enabled' : 'flags.disabled') }),
                );
                setPending(null);
              },
            },
          );
        }}
      />
    </div>
  );
}
