'use client';

import { Button, Dialog, TextField } from '@delyva/ui-web';
import { type ReactNode, useState } from 'react';
import { type MessageKey, t } from '../../lib/i18n';

/** Prep-time choices in minutes. */
export const PREP_CHOICES = [10, 15, 20, 30, 45] as const;

/** Accept dialog: one tap per prep time, the default preselected. */
export function AcceptDialog({
  orderRef,
  open,
  defaultMinutes = 15,
  busy,
  onClose,
  onConfirm,
}: {
  readonly orderRef: string;
  readonly open: boolean;
  readonly defaultMinutes?: number;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (prepMinutes: number) => void;
}): ReactNode {
  const [minutes, setMinutes] = useState<number>(defaultMinutes);
  return (
    <Dialog open={open} title={t('accept.title', { ref: orderRef })} onClose={onClose}>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-body font-semibold">{t('accept.prep')}</legend>
        <div className="flex flex-wrap gap-2">
          {PREP_CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={minutes === m}
              onClick={() => {
                setMinutes(m);
              }}
              className={`h-12 min-w-20 rounded-pill border px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-primary ${minutes === m ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-text'}`}
            >
              {t('accept.minutes', { minutes: m })}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="brand"
          size="lg"
          loading={busy}
          onClick={() => {
            onConfirm(minutes);
          }}
        >
          {t('accept.confirm', { minutes })}
        </Button>
      </div>
    </Dialog>
  );
}

const REASONS = ['out_of_stock', 'too_busy', 'closing', 'other'] as const;

/** Reject dialog: a reason preset plus details (the API needs at least 3 characters). */
export function RejectDialog({
  orderRef,
  open,
  busy,
  onClose,
  onConfirm,
}: {
  readonly orderRef: string;
  readonly open: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (reason: string) => void;
}): ReactNode {
  const [preset, setPreset] = useState<(typeof REASONS)[number]>('out_of_stock');
  const [details, setDetails] = useState('');
  const reason = [t(`reject.reason.${preset}` as MessageKey), details.trim()]
    .filter(Boolean)
    .join(': ');
  const valid = preset !== 'other' || details.trim().length >= 3;
  return (
    <Dialog open={open} title={t('reject.title', { ref: orderRef })} onClose={onClose}>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-body font-semibold">{t('reject.reason')}</legend>
        {REASONS.map((r) => (
          <label key={r} className="flex min-h-12 items-center gap-3 text-body">
            <input
              type="radio"
              name="reject-reason"
              value={r}
              checked={preset === r}
              onChange={() => {
                setPreset(r);
              }}
              className="h-5 w-5 accent-primary"
            />
            {t(`reject.reason.${r}` as MessageKey)}
          </label>
        ))}
      </fieldset>
      <div className="mt-3">
        <TextField
          label={t('reject.details')}
          value={details}
          maxLength={200}
          onChange={(e) => {
            setDetails(e.target.value);
          }}
        />
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="danger"
          loading={busy}
          disabled={!valid}
          onClick={() => {
            onConfirm(reason);
          }}
        >
          {t('reject.confirm')}
        </Button>
      </div>
    </Dialog>
  );
}
