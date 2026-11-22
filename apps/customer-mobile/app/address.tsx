import { CreateAddressSchema } from '@delyva/contracts';
import { tokens } from '@delyva/design-tokens';
import { useCreateAddress } from '@delyva/sdk';
import { AppText, Button, Chip, TextField } from '@delyva/ui-native';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactElement, useMemo, useState } from 'react';
import { View } from 'react-native';
import { api } from '../src/api/client';
import { errorMessage } from '../src/api/query-client';
import { useSession } from '../src/auth/session-store';
import { AddressMap } from '../src/components/address-map';
import type { MapPoint } from '../src/components/order-map';
import { goBack, Screen } from '../src/components/screen';
import { track } from '../src/device/analytics';
import { nearestArea, SERVICE_AREAS } from '../src/features/service-areas';
import { t } from '../src/i18n';
import { usePrefs } from '../src/state/prefs-store';

function parsePoint(lat?: string, lng?: string): MapPoint | null {
  const a = Number(lat);
  const b = Number(lng);
  return lat && lng && Number.isFinite(a) && Number.isFinite(b) ? { lat: a, lng: b } : null;
}

/** C06b: map pin (native) or area pick (web/no GPS) + street, landmark and label. */
export default function AddressScreen(): ReactElement {
  const params = useLocalSearchParams<{ lat?: string; lng?: string; mode?: string }>();
  const adding = params.mode === 'add';
  const current = usePrefs((s) => s.address);
  const setAddress = usePrefs((s) => s.setAddress);
  const authed = useSession((s) => s.status === 'authed');
  const create = useCreateAddress(api);
  const initial = parsePoint(params.lat, params.lng) ?? (adding || !current ? null : current);
  const [point, setPoint] = useState<MapPoint | null>(initial);
  const [areaId, setAreaId] = useState<string | null>(
    initial ? (nearestArea(initial.lat, initial.lng)?.id ?? null) : null,
  );
  const [line1, setLine1] = useState(adding ? '' : (current?.line1 ?? ''));
  const [landmark, setLandmark] = useState(adding ? '' : (current?.landmark ?? ''));
  const [label, setLabel] = useState(adding ? '' : (current?.label ?? t('address.defaultLabel')));
  const [touched, setTouched] = useState(false);
  const idemKey = useMemo(() => randomUUID(), []);
  const lineError = line1.trim().length < 3 ? t('address.errorLine1') : null;
  const pointError = point ? null : t('address.errorArea');

  const save = async (): Promise<void> => {
    setTouched(true);
    if (lineError || !point) return;
    const body = CreateAddressSchema.parse({
      label: label.trim() || t('address.defaultLabel'),
      line1: line1.trim(),
      ...(landmark.trim() ? { landmark: landmark.trim() } : {}),
      lat: point.lat,
      lng: point.lng,
    });
    let savedId: string | null = null;
    if (authed) savedId = (await create.mutateAsync({ ...body, idempotencyKey: idemKey })).id;
    setAddress({ ...body, landmark: body.landmark ?? null, savedId });
    track({ name: 'onboarding_step_completed', step: 'address' });
    if (adding) goBack();
    else router.replace('/home');
  };

  return (
    <Screen
      title={t('address.title')}
      back={router.canGoBack()}
      testID="address"
      footer={
        <Button
          label={t('address.save')}
          size="lg"
          loading={create.isPending}
          onPress={() => {
            void save().catch(() => undefined);
          }}
        />
      }
    >
      <AddressMap
        point={point}
        onMove={(p) => {
          setPoint(p);
        }}
      />
      <AppText variant="caption" tone="muted">
        {t('address.mapHint')}
      </AppText>
      <AppText variant="caption" tone="muted">
        {t('address.area')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] }}>
        {SERVICE_AREAS.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            testID={`area-${a.id}`}
            selected={areaId === a.id}
            onPress={() => {
              setAreaId(a.id);
              setPoint({ lat: a.lat, lng: a.lng });
            }}
          />
        ))}
      </View>
      {touched && pointError ? (
        <AppText variant="caption" tone="danger">
          {pointError}
        </AppText>
      ) : null}
      <TextField
        label={t('address.line1')}
        placeholder={t('address.line1Placeholder')}
        value={line1}
        onChangeText={setLine1}
        autoComplete="street-address"
        error={touched ? lineError : null}
        testID="address-line1"
      />
      <TextField
        label={t('address.landmark')}
        placeholder={t('address.landmarkPlaceholder')}
        value={landmark}
        onChangeText={setLandmark}
        testID="address-landmark"
      />
      <TextField
        label={t('address.label')}
        placeholder={t('address.labelPlaceholder')}
        value={label}
        onChangeText={setLabel}
        testID="address-label"
      />
      {create.isError ? (
        <AppText tone="danger" accessibilityLiveRegion="polite">
          {errorMessage(create.error, t('address.saveError'))}
        </AppText>
      ) : null}
    </Screen>
  );
}
