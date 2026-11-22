'use client';
import { PromoTypeSchema, type Promo, type PromoType } from '@delyva/contracts';
import { usePromos } from '@delyva/sdk';
import { Badge, Button, Card, Modal, SelectField, TextField } from '@delyva/ui-web';
import { useMemo, useState, type ReactNode } from 'react';
import { DataTable, columnsFor, type Columns } from '@/components/data-table';
import { EmptyBlock, QueryView } from '@/components/query-view';
import { adminClient } from '@/lib/client/api';
import { errorMessage } from '@/lib/client/errors';
import { useSavePromo } from '@/lib/client/queries';
import { useToast } from '@/lib/client/toasts';
import { formatBps, formatDateTime, formatKobo } from '@/lib/format';
import { t } from '@/lib/i18n';
import { buildPromo, type PromoFormValues } from './promo-form';

const col = columnsFor<Promo>();

function valueOf(p: Promo): string {
  if (p.type === 'percent_off' && p.percentBps !== null) return formatBps(p.percentBps);
  if (p.type === 'fixed_off' && p.valueMinor !== null) return formatKobo(p.valueMinor);
  return t('pricing.promoType.free_delivery');
}

function promoColumns(onToggle: (p: Promo) => void, busyId: string | null): Columns<Promo> {
  return col.columns([
    col.accessor('code', {
      header: () => t('pricing.col.code'),
      cell: (c) => <code className="font-semibold">{c.getValue()}</code>,
    }),
    col.accessor('type', {
      header: () => t('pricing.col.type'),
      cell: (c) => t(`pricing.promoType.${c.getValue()}`),
    }),
    col.display({
      id: 'value',
      header: () => t('pricing.col.value'),
      cell: (c) => valueOf(c.row.original),
    }),
    col.accessor('redemptionCount', { header: () => t('pricing.col.usage') }),
    col.accessor('endsAt', {
      header: () => t('pricing.col.ends'),
      cell: (c) => formatDateTime(c.getValue()),
    }),
    col.accessor('active', {
      header: () => t('pricing.col.state'),
      cell: (c) => (
        <Badge tone={c.getValue() ? 'success' : 'neutral'}>
          {t(c.getValue() ? 'common.active' : 'common.inactive')}
        </Badge>
      ),
    }),
    col.display({
      id: 'toggle',
      header: () => t('pricing.col.state'),
      cell: (c) => (
        <Button
          size="sm"
          variant="soft"
          loading={busyId === c.row.original.id}
          onClick={() => {
            onToggle(c.row.original);
          }}
        >
          {t(c.row.original.active ? 'pricing.deactivate' : 'pricing.activate')}
        </Button>
      ),
    }),
  ]) as Columns<Promo>;
}

const INITIAL: PromoFormValues = {
  code: '',
  type: 'fixed_off',
  value: '500',
  percentBps: '1000',
  maxDiscount: '',
  minOrder: '2000',
  audience: 'all',
  startsAt: '',
  endsAt: '',
  perUserLimit: '1',
};

const FIELD_ERROR: Record<string, string> = {
  code: t('pricing.promoCodeInvalid'),
  dates: t('pricing.dateInvalid'),
  minOrder: t('pricing.amountInvalid'),
};

function NewPromo({ onClose }: { readonly onClose: () => void }): ReactNode {
  const [v, setV] = useState<PromoFormValues>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const save = useSavePromo();
  const toast = useToast();
  const set = (k: keyof PromoFormValues) => (e: { target: { value: string } }) => {
    setV((f) => ({ ...f, [k]: k === 'code' ? e.target.value.toUpperCase() : e.target.value }));
  };
  const submit = (): void => {
    const built = buildPromo(v);
    if (!built.ok) {
      setError(FIELD_ERROR[built.field] ?? t('pricing.amountInvalid'));
      return;
    }
    setError(null);
    save.mutate(
      { id: null, body: built.body },
      {
        onSuccess: () => {
          toast('success', t('pricing.promoCreated', { code: built.body.code }));
          onClose();
        },
      },
    );
  };
  return (
    <Modal
      open
      title={t('pricing.newPromo')}
      onClose={onClose}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <TextField
          id="promo-code"
          label={t('pricing.promoCode')}
          value={v.code}
          onChange={set('code')}
        />
        <SelectField
          id="promo-type"
          label={t('pricing.promoType')}
          value={v.type}
          options={PromoTypeSchema.options.map((o: PromoType) => ({
            value: o,
            label: t(`pricing.promoType.${o}`),
          }))}
          onChange={set('type')}
        />
        {v.type === 'fixed_off' ? (
          <TextField
            id="promo-value"
            label={t('pricing.promoValue')}
            inputMode="decimal"
            value={v.value}
            onChange={set('value')}
          />
        ) : null}
        {v.type === 'percent_off' ? (
          <TextField
            id="promo-percent"
            label={t('pricing.promoPercent')}
            inputMode="numeric"
            value={v.percentBps}
            onChange={set('percentBps')}
          />
        ) : null}
        {v.type === 'percent_off' ? (
          <TextField
            id="promo-max"
            label={t('pricing.promoMax')}
            inputMode="decimal"
            value={v.maxDiscount}
            onChange={set('maxDiscount')}
          />
        ) : null}
        <TextField
          id="promo-min"
          label={t('pricing.promoMinOrder')}
          inputMode="decimal"
          value={v.minOrder}
          onChange={set('minOrder')}
        />
        <SelectField
          id="promo-audience"
          label={t('pricing.promoAudience')}
          value={v.audience}
          options={[
            { value: 'all', label: t('pricing.audience.all') },
            { value: 'new_users', label: t('pricing.audience.new_users') },
          ]}
          onChange={set('audience')}
        />
        <TextField
          id="promo-per-user"
          label={t('pricing.promoPerUser')}
          inputMode="numeric"
          value={v.perUserLimit}
          onChange={set('perUserLimit')}
        />
        <TextField
          id="promo-starts"
          type="datetime-local"
          label={t('pricing.promoStarts')}
          value={v.startsAt}
          onChange={set('startsAt')}
        />
        <TextField
          id="promo-ends"
          type="datetime-local"
          label={t('pricing.promoEnds')}
          value={v.endsAt}
          onChange={set('endsAt')}
        />
      </div>
      {error ? (
        <p role="alert" className="text-caption font-semibold text-danger">
          {error}
        </p>
      ) : null}
      {save.error ? (
        <p role="alert" className="text-caption font-semibold text-danger">
          {errorMessage(save.error)}
        </p>
      ) : null}
    </Modal>
  );
}

/** A09 promos: list, toggle, create. */
export function Promos(): ReactNode {
  const promos = usePromos(adminClient);
  const save = useSavePromo();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const busyId = save.isPending ? (save.variables.id ?? null) : null;
  const columns = useMemo(
    () =>
      promoColumns((p) => {
        save.mutate(
          { id: p.id, body: { active: !p.active } },
          {
            onSuccess: () => {
              toast('success', t('pricing.promoToggled', { code: p.code }));
            },
            onError: (e) => {
              toast('danger', errorMessage(e));
            },
          },
        );
      }, busyId),
    [save, toast, busyId],
  );
  return (
    <Card
      title={t('pricing.promos')}
      actions={
        <Button
          size="sm"
          variant="brand"
          onClick={() => {
            setCreating(true);
          }}
        >
          {t('pricing.newPromo')}
        </Button>
      }
    >
      <QueryView
        query={promos}
        what={t('pricing.promos')}
        isEmpty={(d) => d.items.length === 0}
        empty={<EmptyBlock title={t('pricing.promosEmpty')} body={t('pricing.promosEmptyBody')} />}
      >
        {(d) => (
          <DataTable
            caption={t('pricing.promos')}
            columns={columns}
            data={d.items}
            rowId={(p) => p.id}
          />
        )}
      </QueryView>
      {creating ? (
        <NewPromo
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </Card>
  );
}
