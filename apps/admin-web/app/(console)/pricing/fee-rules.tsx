'use client';
import type { FeeRule } from '@delyva/contracts';
import { useFeeRules } from '@delyva/sdk';
import { Badge, Button, Card, Checkbox, Modal, TextField } from '@delyva/ui-web';
import { useMemo, useState, type ReactNode } from 'react';
import { DataTable, columnsFor, type Columns } from '@/components/data-table';
import { EmptyBlock, QueryView } from '@/components/query-view';
import { adminClient } from '@/lib/client/api';
import { errorMessage } from '@/lib/client/errors';
import { useUpdateFeeRule } from '@/lib/client/queries';
import { useToast } from '@/lib/client/toasts';
import { formatBps, formatKobo, koboToNairaInput, parseNairaToKobo } from '@/lib/format';
import { t } from '@/lib/i18n';

const col = columnsFor<FeeRule>();

function feeColumns(onEdit: (r: FeeRule) => void): Columns<FeeRule> {
  return col.columns([
    col.accessor('zoneCode', { header: () => t('pricing.col.zone') }),
    col.accessor('baseFeeMinor', {
      header: () => t('pricing.col.base'),
      cell: (c) => formatKobo(c.getValue()),
    }),
    col.accessor('minFeeMinor', {
      header: () => t('pricing.col.min'),
      cell: (c) => formatKobo(c.getValue()),
    }),
    col.accessor('maxFeeMinor', {
      header: () => t('pricing.col.max'),
      cell: (c) => formatKobo(c.getValue()),
    }),
    col.accessor('serviceFeeBps', {
      header: () => t('pricing.col.service'),
      cell: (c) => formatBps(c.getValue()),
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
      id: 'edit',
      header: () => t('pricing.edit'),
      cell: (c) => (
        <Button
          size="sm"
          variant="soft"
          aria-label={t('pricing.editFee', { zone: c.row.original.zoneCode })}
          onClick={() => {
            onEdit(c.row.original);
          }}
        >
          {t('pricing.edit')}
        </Button>
      ),
    }),
  ]) as Columns<FeeRule>;
}

interface FeeForm {
  base: string;
  min: string;
  max: string;
  bps: string;
  active: boolean;
}

function toForm(r: FeeRule): FeeForm {
  return {
    base: koboToNairaInput(r.baseFeeMinor),
    min: koboToNairaInput(r.minFeeMinor),
    max: koboToNairaInput(r.maxFeeMinor),
    bps: String(r.serviceFeeBps),
    active: r.active,
  };
}

function parseBps(v: string): number | null {
  return /^\d{1,5}$/.test(v) && Number(v) <= 10_000 ? Number(v) : null;
}

function EditFeeRule({
  rule,
  onClose,
}: {
  readonly rule: FeeRule;
  readonly onClose: () => void;
}): ReactNode {
  const [form, setForm] = useState<FeeForm>(() => toForm(rule));
  const [touched, setTouched] = useState(false);
  const save = useUpdateFeeRule();
  const toast = useToast();
  const base = parseNairaToKobo(form.base);
  const min = parseNairaToKobo(form.min);
  const max = parseNairaToKobo(form.max);
  const bps = parseBps(form.bps);
  const amountErr = (v: number | null): string | null =>
    touched && v === null ? t('pricing.amountInvalid') : null;
  const submit = (): void => {
    setTouched(true);
    if (base === null || min === null || max === null || bps === null) return;
    save.mutate(
      {
        id: rule.id,
        body: {
          baseFeeMinor: base,
          minFeeMinor: min,
          maxFeeMinor: max,
          serviceFeeBps: bps,
          active: form.active,
        },
      },
      {
        onSuccess: () => {
          toast('success', t('pricing.feeSaved', { zone: rule.zoneCode }));
          onClose();
        },
      },
    );
  };
  const set = (k: keyof FeeForm) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };
  return (
    <Modal
      open
      title={t('pricing.editFee', { zone: rule.zoneCode })}
      onClose={onClose}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={submit}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <TextField
          id="fee-base"
          label={t('pricing.baseFee')}
          inputMode="decimal"
          value={form.base}
          error={amountErr(base)}
          onChange={set('base')}
        />
        <TextField
          id="fee-bps"
          label={t('pricing.serviceBps')}
          inputMode="numeric"
          value={form.bps}
          error={touched && bps === null ? t('pricing.bpsInvalid') : null}
          onChange={set('bps')}
        />
        <TextField
          id="fee-min"
          label={t('pricing.minFee')}
          inputMode="decimal"
          value={form.min}
          error={amountErr(min)}
          onChange={set('min')}
        />
        <TextField
          id="fee-max"
          label={t('pricing.maxFee')}
          inputMode="decimal"
          value={form.max}
          error={amountErr(max)}
          onChange={set('max')}
        />
      </div>
      <Checkbox
        id="fee-active"
        label={t('pricing.activeLabel')}
        checked={form.active}
        onChange={(v) => {
          setForm((f) => ({ ...f, active: v }));
        }}
      />
      {save.error ? (
        <p role="alert" className="text-caption font-semibold text-danger">
          {errorMessage(save.error)}
        </p>
      ) : null}
    </Modal>
  );
}

/** A08 fee rules table + edit. */
export function FeeRules(): ReactNode {
  const rules = useFeeRules(adminClient);
  const [editing, setEditing] = useState<FeeRule | null>(null);
  const columns = useMemo(() => feeColumns(setEditing), []);
  return (
    <Card title={t('pricing.fees')}>
      <QueryView
        query={rules}
        what={t('pricing.fees')}
        isEmpty={(d) => d.items.length === 0}
        empty={<EmptyBlock title={t('pricing.feesEmpty')} body={t('pricing.feesEmptyBody')} />}
      >
        {(d) => (
          <DataTable
            caption={t('pricing.fees')}
            columns={columns}
            data={d.items}
            rowId={(r) => r.id}
          />
        )}
      </QueryView>
      {editing ? (
        <EditFeeRule
          rule={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </Card>
  );
}
