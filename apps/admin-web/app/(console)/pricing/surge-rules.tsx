'use client';
import { CreateSurgeRuleSchema, type SurgeRule } from '@delyva/contracts';
import { Badge, Button, Card, Checkbox, Modal, TextField } from '@delyva/ui-web';
import { useMemo, useState, type ReactNode } from 'react';
import { DataTable, columnsFor, type Columns } from '@/components/data-table';
import { EmptyBlock, QueryView } from '@/components/query-view';
import { errorMessage } from '@/lib/client/errors';
import { useSaveSurgeRule, useSurgeRules } from '@/lib/client/queries';
import { useToast } from '@/lib/client/toasts';
import { formatMinute, parseMinute } from '@/lib/format';
import { t, type MessageKey } from '@/lib/i18n';

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const dayLabel = (d: number): string => t(`day.${String(d)}` as MessageKey);
const col = columnsFor<SurgeRule>();

function surgeColumns(onToggle: (r: SurgeRule) => void, busyId: string | null): Columns<SurgeRule> {
  return col.columns([
    col.accessor('zoneCode', { header: () => t('pricing.col.zone') }),
    col.accessor('daysOfWeek', {
      header: () => t('pricing.col.days'),
      cell: (c) => c.getValue().map(dayLabel).join(', '),
    }),
    col.display({
      id: 'window',
      header: () => t('pricing.col.window'),
      cell: (c) =>
        `${formatMinute(c.row.original.startMinute)}–${formatMinute(c.row.original.endMinute)}`,
    }),
    col.accessor('multiplierBps', {
      header: () => t('pricing.col.multiplier'),
      cell: (c) => `${String(c.getValue() / 10_000)}×`,
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
  ]) as Columns<SurgeRule>;
}

function NewSurge({ onClose }: { readonly onClose: () => void }): ReactNode {
  const [zone, setZone] = useState('lagos');
  const [start, setStart] = useState('17:00');
  const [end, setEnd] = useState('20:00');
  const [mult, setMult] = useState('12000');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [touched, setTouched] = useState(false);
  const save = useSaveSurgeRule();
  const toast = useToast();
  const parsed = CreateSurgeRuleSchema.safeParse({
    zoneCode: zone,
    daysOfWeek: days,
    startMinute: parseMinute(start),
    endMinute: parseMinute(end),
    multiplierBps: Number(mult),
    active: true,
  });
  const submit = (): void => {
    setTouched(true);
    if (!parsed.success) return;
    save.mutate(
      { id: null, body: parsed.data },
      {
        onSuccess: () => {
          toast('success', t('pricing.surgeCreated'));
          onClose();
        },
      },
    );
  };
  return (
    <Modal
      open
      title={t('pricing.newSurge')}
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
          id="surge-zone"
          label={t('pricing.zone')}
          value={zone}
          onChange={(e) => {
            setZone(e.target.value);
          }}
        />
        <TextField
          id="surge-mult"
          label={t('pricing.multiplierBps')}
          inputMode="numeric"
          value={mult}
          onChange={(e) => {
            setMult(e.target.value);
          }}
        />
        <TextField
          id="surge-start"
          type="time"
          label={t('pricing.startTime')}
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
          }}
        />
        <TextField
          id="surge-end"
          type="time"
          label={t('pricing.endTime')}
          value={end}
          onChange={(e) => {
            setEnd(e.target.value);
          }}
        />
      </div>
      <fieldset className="flex flex-wrap gap-x-4">
        <legend className="text-caption font-semibold text-text">{t('pricing.days')}</legend>
        {DAYS.map((d) => (
          <Checkbox
            key={d}
            id={`surge-day-${String(d)}`}
            label={dayLabel(d)}
            checked={days.includes(d)}
            onChange={(on) => {
              setDays((all) => (on ? [...all, d].sort() : all.filter((x) => x !== d)));
            }}
          />
        ))}
      </fieldset>
      {touched && !parsed.success ? (
        <p role="alert" className="text-caption font-semibold text-danger">
          {parsed.error.issues[0]?.message}
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

/** A08 surge windows: list, toggle, create. */
export function SurgeRules(): ReactNode {
  const rules = useSurgeRules();
  const save = useSaveSurgeRule();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const busyId = save.isPending ? (save.variables.id ?? null) : null;
  const columns = useMemo(
    () =>
      surgeColumns((r) => {
        save.mutate(
          { id: r.id, body: { active: !r.active } },
          {
            onSuccess: () => {
              toast('success', t('pricing.surgeToggled'));
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
      title={t('pricing.surge')}
      actions={
        <Button
          size="sm"
          variant="brand"
          onClick={() => {
            setCreating(true);
          }}
        >
          {t('pricing.newSurge')}
        </Button>
      }
    >
      <QueryView
        query={rules}
        what={t('pricing.surge')}
        isEmpty={(d) => d.items.length === 0}
        empty={<EmptyBlock title={t('pricing.surgeEmpty')} body={t('pricing.surgeEmptyBody')} />}
      >
        {(d) => (
          <DataTable
            caption={t('pricing.surge')}
            columns={columns}
            data={d.items}
            rowId={(r) => r.id}
          />
        )}
      </QueryView>
      {creating ? (
        <NewSurge
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
    </Card>
  );
}
