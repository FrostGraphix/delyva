import { RiderVehicleSchema } from '@delyva/contracts';
import { Banner, Button, ChoiceGroup, TextField } from '@delyva/ui-native';
import { type ReactElement, useState } from 'react';
import { api } from '../../src/api/client';
import { t } from '../../src/i18n';
import { stepNumber, TOTAL_STEPS } from '../../src/onboarding/routes';
import { UploadField } from '../../src/onboarding/upload-field';
import { useStepForm, useStepView } from '../../src/onboarding/use-step';
import { Screen } from '../../src/ui/screen';

const TYPES = ['motorcycle', 'bicycle', 'car', 'tricycle'] as const;
type VehicleType = (typeof TYPES)[number];
const isType = (v: string): v is VehicleType => (TYPES as readonly string[]).includes(v);

/** Builds the step body; motorised vehicles also send plate and licence fields. */
function body(v: {
  type: VehicleType;
  plate: string;
  licence: string;
  expiry: string;
  licenceDoc: string | null;
  photo: string | null;
}): Record<string, string> {
  const base = { vehicleType: v.type, vehiclePhotoUploadId: v.photo ?? '' };
  if (v.type === 'bicycle') return base;
  return {
    ...base,
    plateNumber: v.plate.trim().toUpperCase(),
    licenceNumber: v.licence.trim().toUpperCase(),
    licenceExpiry: v.expiry,
    licenceUploadId: v.licenceDoc ?? '',
  };
}

/** Step 3 — vehicle, licence and photo uploads. */
export default function VehicleStep(): ReactElement {
  useStepView('vehicle');
  const form = useStepForm();
  const [type, setType] = useState<VehicleType>('motorcycle');
  const [plate, setPlate] = useState('');
  const [licence, setLicence] = useState('');
  const [expiry, setExpiry] = useState('');
  const [licenceDoc, setLicenceDoc] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const motor = type !== 'bicycle';
  const submit = (): void => {
    form.submit(
      RiderVehicleSchema,
      body({ type, plate, licence, expiry, licenceDoc, photo }),
      (b) => api.saveRiderStep('vehicle', b),
    );
  };
  return (
    <Screen
      testID="screen-onb-vehicle"
      eyebrow={t('onb.stepOf', { n: stepNumber('vehicle'), total: TOTAL_STEPS })}
      title={t('onb.vehicleTitle')}
      footer={
        <Button
          label={t('common.continue')}
          variant="brand"
          size="lg"
          loading={form.saving}
          onPress={submit}
        />
      }
    >
      {form.formError ? <Banner tone="danger" text={form.formError} /> : null}
      <ChoiceGroup
        testID="vehicle-type"
        label={t('onb.vehicleType')}
        value={type}
        onChange={(v) => {
          if (isType(v)) setType(v);
        }}
        options={TYPES.map((value) => ({ value, label: t(`onb.vehicle.${value}`) }))}
      />
      {motor ? (
        <>
          <TextField
            testID="plate"
            label={t('onb.plate')}
            value={plate}
            onChangeText={setPlate}
            error={form.errors.plateNumber}
            maxLength={12}
          />
          <TextField
            testID="licence-number"
            label={t('onb.licenceNumber')}
            value={licence}
            onChangeText={setLicence}
            error={form.errors.licenceNumber}
            maxLength={20}
          />
          <TextField
            testID="licence-expiry"
            label={t('onb.licenceExpiry')}
            value={expiry}
            onChangeText={setExpiry}
            error={form.errors.licenceExpiry}
            maxLength={10}
          />
          <UploadField
            testID="licence-doc"
            purpose="drivers_licence"
            label={t('onb.licenceDoc')}
            uploadId={licenceDoc}
            onUploaded={setLicenceDoc}
            error={form.errors.licenceUploadId}
          />
        </>
      ) : null}
      <UploadField
        testID="vehicle-photo"
        purpose="vehicle_photo"
        label={t('onb.vehiclePhoto')}
        uploadId={photo}
        onUploaded={setPhoto}
        error={form.errors.vehiclePhotoUploadId ?? form.errors._form}
      />
    </Screen>
  );
}
