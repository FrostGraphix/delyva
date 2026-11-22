'use client';
import { TERMINAL_ORDER_STATUSES, type OrderSummary } from '@delyva/contracts';
import { Alert, Button, Card, SelectField } from '@delyva/ui-web';
import { useState, type ReactNode } from 'react';
import { ReasonDialog } from '@/components/reason-dialog';
import { errorMessage } from '@/lib/client/errors';
import { useOpsAssign, useOpsCancelOrder, useOpsRiders } from '@/lib/client/queries';
import { useToast } from '@/lib/client/toasts';
import { t } from '@/lib/i18n';

const CANCELLABLE_UNTIL_CLOSED = (o: OrderSummary): boolean =>
  !TERMINAL_ORDER_STATUSES.includes(o.status) &&
  ![
    'CANCELLED_BY_OPS',
    'CANCELLED_BY_CUSTOMER',
    'VENDOR_REJECTED',
    'UNDELIVERABLE',
    'REFUND_PENDING',
  ].includes(o.status);

function CancelAction({ order }: { readonly order: OrderSummary }): ReactNode {
  const [open, setOpen] = useState(false);
  const cancel = useOpsCancelOrder(order.id);
  const toast = useToast();
  return (
    <>
      <Button
        variant="danger"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('order.cancel')}
      </Button>
      <ReasonDialog
        open={open}
        title={t('order.cancelTitle', { ref: order.ref })}
        confirmLabel={t('order.cancel')}
        variant="danger"
        busy={cancel.isPending}
        error={cancel.error ? errorMessage(cancel.error) : null}
        onClose={() => {
          setOpen(false);
          cancel.reset();
        }}
        onConfirm={(reason) => {
          cancel.mutate(
            { reason },
            {
              onSuccess: () => {
                setOpen(false);
                toast('success', t('order.cancelled', { ref: order.ref }));
              },
            },
          );
        }}
      >
        <p className="text-body text-text-muted">{t('order.cancelBody')}</p>
      </ReasonDialog>
    </>
  );
}

function AssignAction({ order }: { readonly order: OrderSummary }): ReactNode {
  const [open, setOpen] = useState(false);
  const [riderId, setRiderId] = useState('');
  const riders = useOpsRiders(open);
  const assign = useOpsAssign(order.id);
  const toast = useToast();
  const free = (riders.data?.items ?? []).filter(
    (r) => r.status === 'online' && r.activeOrderId === null,
  );
  const options = [
    { value: '', label: t('order.assignRider') },
    ...free.map((r) => ({
      value: r.riderId,
      label: `${r.riderId.slice(0, 8)}${r.vehiclePlate ? ` · ${r.vehiclePlate}` : ''}`,
    })),
  ];
  return (
    <>
      <Button
        variant="ink"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('order.assign')}
      </Button>
      <ReasonDialog
        open={open}
        title={t('order.assignTitle', { ref: order.ref })}
        confirmLabel={t('order.assign')}
        busy={assign.isPending}
        confirmDisabled={riderId === ''}
        error={assign.error ? errorMessage(assign.error) : null}
        onClose={() => {
          setOpen(false);
          assign.reset();
        }}
        onConfirm={(reason) => {
          assign.mutate(
            { riderId, reason },
            {
              onSuccess: () => {
                setOpen(false);
                toast('success', t('order.assigned', { ref: order.ref }));
              },
            },
          );
        }}
      >
        {riders.isSuccess && free.length === 0 ? (
          <Alert tone="warning" title={t('order.assignNoRiders')} />
        ) : null}
        <SelectField
          id="assign-rider"
          label={t('order.assignRider')}
          options={options}
          value={riderId}
          onChange={(e) => {
            setRiderId(e.target.value);
          }}
        />
      </ReasonDialog>
    </>
  );
}

/** A04 interventions: ops cancel and manual rider assignment, both with an audit reason. */
export function OrderActions({
  order,
  canCancel,
  canAssign,
}: {
  readonly order: OrderSummary;
  readonly canCancel: boolean;
  readonly canAssign: boolean;
}): ReactNode {
  const open = CANCELLABLE_UNTIL_CLOSED(order);
  return (
    <Card title={t('order.actions')}>
      {open ? (
        <div className="flex flex-wrap gap-3">
          {canAssign ? <AssignAction order={order} /> : null}
          {canCancel ? <CancelAction order={order} /> : null}
        </div>
      ) : (
        <p className="text-body text-text-muted">{t('order.terminal')}</p>
      )}
    </Card>
  );
}
