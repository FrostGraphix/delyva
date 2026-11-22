'use client';
import { Button, Card } from '@delyva/ui-web';
import { useState, type ReactNode } from 'react';
import { ReasonDialog } from '@/components/reason-dialog';
import { adminClient } from '@/lib/client/api';
import { errorMessage } from '@/lib/client/errors';
import { useDecideApplication } from '@/lib/client/queries';
import { useToast } from '@/lib/client/toasts';
import { t } from '@/lib/i18n';

/** Facts shown for one application. */
export interface ReviewFact {
  readonly label: string;
  readonly value: ReactNode;
}

/** Review panel props. */
export interface ReviewPanelProps {
  readonly kind: 'rider' | 'vendor';
  readonly id: string;
  readonly name: string;
  readonly reviewable: boolean;
  readonly facts: readonly ReviewFact[];
  readonly documentIds: readonly string[];
  readonly onDone: () => void;
}

function Documents({ ids }: { readonly ids: readonly string[] }): ReactNode {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const open = (id: string): void => {
    setBusy(id);
    adminClient
      .getUploadDownloadUrl(id)
      .then((d) => {
        window.open(d.url, '_blank', 'noopener,noreferrer');
      })
      .catch(() => {
        toast('danger', t('apps.documentOpenFailed'));
      })
      .finally(() => {
        setBusy(null);
      });
  };
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t('apps.documents')}>
      {ids.map((id, i) => (
        <li key={id}>
          <Button
            size="sm"
            variant="soft"
            loading={busy === id}
            onClick={() => {
              open(id);
            }}
          >
            {t('apps.document', { n: i + 1 })}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** A06 review: facts, signed-URL documents, approve/reject with an audit reason. */
export function ReviewPanel(props: ReviewPanelProps): ReactNode {
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const decide = useDecideApplication(props.kind);
  const toast = useToast();
  const confirm = (reason: string): void => {
    if (!decision) return;
    decide.mutate(
      { id: props.id, decision, body: { reason } },
      {
        onSuccess: () => {
          toast(
            'success',
            t(decision === 'approve' ? 'apps.approved' : 'apps.rejected', { name: props.name }),
          );
          setDecision(null);
          props.onDone();
        },
      },
    );
  };
  return (
    <Card title={t('apps.reviewOf', { name: props.name })}>
      <dl className="grid grid-cols-2 gap-4">
        {props.facts.map((f) => (
          <div key={f.label} className="flex flex-col gap-1">
            <dt className="text-caption text-text-muted">{f.label}</dt>
            <dd className="text-body font-semibold text-text">{f.value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-6 mb-2 font-heading text-h3 font-bold">{t('apps.documents')}</h3>
      <Documents ids={props.documentIds} />
      {props.reviewable ? (
        <div className="mt-6 flex gap-3">
          <Button
            variant="brand"
            onClick={() => {
              setDecision('approve');
            }}
          >
            {t('apps.approve')}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setDecision('reject');
            }}
          >
            {t('apps.reject')}
          </Button>
        </div>
      ) : null}
      <ReasonDialog
        open={decision !== null}
        title={t(decision === 'reject' ? 'apps.rejectTitle' : 'apps.approveTitle', {
          name: props.name,
        })}
        confirmLabel={t(decision === 'reject' ? 'apps.reject' : 'apps.approve')}
        variant={decision === 'reject' ? 'danger' : 'brand'}
        busy={decide.isPending}
        error={decide.error ? errorMessage(decide.error) : null}
        onClose={() => {
          setDecision(null);
          decide.reset();
        }}
        onConfirm={confirm}
      />
    </Card>
  );
}
