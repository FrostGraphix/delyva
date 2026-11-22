import type { UploadPurpose } from '@delyva/contracts';
import { CheckCircleIcon } from '@delyva/icons/native';
import { Button, Card, Typography, useThemeColors } from '@delyva/ui-native';
import { type ReactElement, useState } from 'react';
import { t } from '../i18n';
import { pickAndUpload } from './upload';

/** Upload field props. */
export interface UploadFieldProps {
  readonly purpose: UploadPurpose;
  readonly label: string;
  readonly hint?: string;
  readonly uploadId: string | null;
  readonly onUploaded: (uploadId: string) => void;
  readonly error?: string;
  readonly testID: string;
}

/** Card with a pick-and-upload action and a done state (icon + text, not colour alone). */
export function UploadField(p: UploadFieldProps): ReactElement {
  const c = useThemeColors();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const onPress = (): void => {
    setBusy(true);
    setFailed(false);
    pickAndUpload(p.purpose)
      .then((id) => {
        if (id) p.onUploaded(id);
      })
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const done = p.uploadId !== null;
  return (
    <Card testID={`${p.testID}-card`}>
      <Typography variant="h3">{p.label}</Typography>
      {p.hint ? <Typography tone="muted">{p.hint}</Typography> : null}
      {done ? (
        <Typography tone="accent" testID={`${p.testID}-done`}>
          <CheckCircleIcon size={16} color={c.accentText} /> {t('onb.uploaded')}
        </Typography>
      ) : null}
      {failed || p.error ? (
        <Typography tone="danger">{p.error ?? t('onb.uploadFailed')}</Typography>
      ) : null}
      <Button
        label={p.label}
        accessibilityLabel={p.label}
        variant="soft"
        size="md"
        loading={busy}
        onPress={onPress}
      />
    </Card>
  );
}
