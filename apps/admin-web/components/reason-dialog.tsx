'use client';
import { AdminReasonSchema } from '@delyva/contracts';
import { Button, Modal, TextAreaField } from '@delyva/ui-web';
import { useId, useState, type ReactNode } from 'react';
import { t } from '@/lib/i18n';

/** Reason dialog props. */
export interface ReasonDialogProps {
  readonly open: boolean;
  readonly title: string;
  /** Extra explanation or form fields shown above the reason. */
  readonly children?: ReactNode;
  readonly confirmLabel: string;
  readonly variant?: 'ink' | 'danger' | 'brand';
  readonly busy: boolean;
  /** Error from the last attempt (plain language). */
  readonly error?: string | null;
  /** Disable confirm for reasons outside the dialog (e.g. no rider picked). */
  readonly confirmDisabled?: boolean;
  readonly onClose: () => void;
  /** Called with the trimmed, validated reason. */
  readonly onConfirm: (reason: string) => void;
}

/** Modal that demands an audit reason (5–500 chars, as the API's AdminReasonSchema) before acting. */
export function ReasonDialog(props: ReasonDialogProps): ReactNode {
  const id = useId();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = AdminReasonSchema.safeParse(reason).success;
  const close = (): void => {
    setReason('');
    setTouched(false);
    props.onClose();
  };
  const footer = (
    <>
      <Button variant="ghost" onClick={close}>
        {t('common.cancel')}
      </Button>
      <Button
        variant={props.variant ?? 'ink'}
        loading={props.busy}
        disabled={props.confirmDisabled === true}
        onClick={() => {
          setTouched(true);
          if (valid) props.onConfirm(reason.trim());
        }}
      >
        {props.confirmLabel}
      </Button>
    </>
  );
  return (
    <Modal
      open={props.open}
      title={props.title}
      onClose={close}
      closeLabel={t('common.close')}
      footer={footer}
    >
      {props.children}
      <TextAreaField
        id={`${id}-reason`}
        label={t('common.reason')}
        hint={t('common.reasonHint')}
        value={reason}
        maxLength={500}
        error={touched && !valid ? t('common.reasonTooShort') : (props.error ?? null)}
        onChange={(e) => {
          setReason(e.target.value);
        }}
      />
    </Modal>
  );
}
