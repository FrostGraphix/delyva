import { BankAccountInputSchema } from '@delyva/contracts';
import { Banner, Button, Card, TextField, Typography } from '@delyva/ui-native';
import { type ReactElement, useState } from 'react';
import { api } from '../../src/api/client';
import { t } from '../../src/i18n';
import { stepNumber, TOTAL_STEPS } from '../../src/onboarding/routes';
import { useStepForm, useStepView } from '../../src/onboarding/use-step';
import { Screen } from '../../src/ui/screen';

/** Step 5 — payout bank account, resolved by name; a mismatch needs explicit confirmation. */
export default function BankStep(): ReactElement {
  useStepView('bank_account');
  const [mismatch, setMismatch] = useState(false);
  const form = useStepForm((code) => {
    if (code !== 'bank_account_name_mismatch') return null;
    setMismatch(true);
    return t('onb.nameMismatch');
  });
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const save = (confirmNameMismatch: boolean): void => {
    const values = confirmNameMismatch
      ? { bankCode, accountNumber, confirmNameMismatch }
      : { bankCode, accountNumber };
    form.submit(BankAccountInputSchema, values, (b) => api.saveRiderStep('bank_account', b));
  };
  return (
    <Screen
      testID="screen-onb-bank"
      eyebrow={t('onb.stepOf', { n: stepNumber('bank_account'), total: TOTAL_STEPS })}
      title={t('onb.bankTitle')}
      footer={
        mismatch ? (
          <Button
            label={t('onb.keepAccount')}
            variant="brand"
            size="lg"
            loading={form.saving}
            onPress={() => {
              save(true);
            }}
          />
        ) : (
          <Button
            label={t('common.continue')}
            variant="brand"
            size="lg"
            loading={form.saving}
            onPress={() => {
              save(false);
            }}
          />
        )
      }
    >
      {form.formError && !mismatch ? <Banner tone="danger" text={form.formError} /> : null}
      {mismatch ? (
        <Card testID="name-mismatch">
          <Typography variant="h3">{t('onb.nameMismatch')}</Typography>
        </Card>
      ) : null}
      <TextField
        testID="bank-code"
        label={t('onb.bankCode')}
        value={bankCode}
        onChangeText={(v) => {
          setBankCode(v);
          setMismatch(false);
        }}
        keyboardType="number-pad"
        maxLength={6}
        error={form.errors.bankCode}
      />
      <TextField
        testID="account-number"
        label={t('onb.accountNumber')}
        value={accountNumber}
        onChangeText={(v) => {
          setAccountNumber(v);
          setMismatch(false);
        }}
        keyboardType="number-pad"
        maxLength={10}
        error={form.errors.accountNumber}
      />
    </Screen>
  );
}
