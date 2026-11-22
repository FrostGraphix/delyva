'use client';

import type { MenuImportResult, VendorApplication, VendorStep } from '@delyva/contracts';
import { ApiError, type VendorStepBodies } from '@delyva/sdk';
import { Button, FormTextField } from '@delyva/ui-web';
import { type ReactNode, type SyntheticEvent, useState } from 'react';
import { browserClient, uploadFile } from '../../lib/client/api';
import { type MessageKey, t } from '../../lib/i18n';

/** Props every step receives. */
export interface StepProps {
  readonly app: VendorApplication;
  /** Called with the updated application after a successful save. */
  readonly onSaved: (app: VendorApplication) => void;
}

/** Plain-language error plus per-field/line details from problem+json. */
export function problemLines(err: unknown): { message: string; lines: string[] } {
  if (!(err instanceof ApiError)) return { message: t('common.error'), lines: [] };
  return {
    message: err.problem.detail ?? err.problem.title,
    lines: (err.problem.errors ?? []).map((e) => `${e.path}: ${e.message}`),
  };
}

function useSave<K extends keyof VendorStepBodies>(step: K, onSaved: StepProps['onSaved']) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; lines: string[]; code?: string } | null>(
    null,
  );
  async function save(body: VendorStepBodies[K]): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      onSaved(await browserClient().saveVendorStep(step, body));
    } catch (err) {
      setError({
        ...problemLines(err),
        ...(err instanceof ApiError ? { code: err.problem.code } : {}),
      });
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, save };
}

/** Error block with line-numbered details. */
export function StepError({
  error,
}: {
  readonly error: { message: string; lines: string[] } | null;
}): ReactNode {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger p-3 text-body text-danger">
      <p className="font-semibold">{error.message}</p>
      {error.lines.length > 0 ? (
        <ul className="mt-1 list-disc pl-5 text-caption">
          {error.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly { value: string; label: string }[];
  readonly onChange: (v: string) => void;
}): ReactNode {
  return (
    <label className="flex flex-col gap-1 text-caption font-semibold">
      {label}
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="h-12 rounded-lg border border-line bg-surface px-3 text-body text-text"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const submitBtn = (busy: boolean, disabled = false): ReactNode => (
  <Button type="submit" variant="brand" size="lg" loading={busy} disabled={disabled}>
    {t('common.continue')}
  </Button>
);

const CATEGORIES = ['restaurant', 'grocery', 'pharmacy', 'bakery', 'shop'] as const;

/** Step 1: business details. */
export function BusinessStep({ app, onSaved }: StepProps): ReactNode {
  const { busy, error, save } = useSave('business_details', onSaved);
  const [name, setName] = useState(app.businessDetails?.businessName ?? '');
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>(
    app.businessDetails?.category ?? 'restaurant',
  );
  const [description, setDescription] = useState(app.businessDetails?.description ?? '');
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save({
          businessName: name.trim(),
          category,
          ...(description.trim() ? { description: description.trim() } : {}),
        });
      }}
    >
      <FormTextField
        label={t('onboarding.businessName')}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        required
      />
      <Select
        label={t('onboarding.category')}
        value={category}
        options={CATEGORIES.map((c) => ({
          value: c,
          label: t(`onboarding.category.${c}` as MessageKey),
        }))}
        onChange={(v) => {
          setCategory(v as (typeof CATEGORIES)[number]);
        }}
      />
      <FormTextField
        label={t('onboarding.description')}
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
        }}
      />
      <StepError error={error} />
      {submitBtn(busy, name.trim().length < 2)}
    </form>
  );
}

/** File picker that uploads through the BFF and reports the upload id. */
function FilePick({
  label,
  purpose,
  accept,
  onUploaded,
}: {
  readonly label: string;
  readonly purpose: string;
  readonly accept: string;
  readonly onUploaded: (id: string | null) => void;
}): ReactNode {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  return (
    <label className="flex flex-col gap-1 text-caption font-semibold">
      {label}
      <input
        type="file"
        accept={accept}
        className="text-body"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setState('busy');
          onUploaded(null);
          uploadFile(f, purpose).then(
            (id) => {
              setState('done');
              onUploaded(id);
            },
            () => {
              setState('error');
            },
          );
        }}
      />
      <span aria-live="polite" className={state === 'error' ? 'text-danger' : 'text-text-muted'}>
        {state === 'busy'
          ? t('common.loading')
          : state === 'done'
            ? t('onboarding.uploaded')
            : state === 'error'
              ? t('common.error')
              : ''}
      </span>
    </label>
  );
}

const ID_TYPES = ['nin', 'drivers_licence', 'international_passport', 'voters_card'] as const;

/** Step 2: CAC + owner ID (files go through signed URLs server-side). */
export function DocumentsStep({ onSaved }: StepProps): ReactNode {
  const { busy, error, save } = useSave('documents', onSaved);
  const [cac, setCac] = useState('');
  const [cacFile, setCacFile] = useState<string | null>(null);
  const [idType, setIdType] = useState<(typeof ID_TYPES)[number]>('nin');
  const [idNumber, setIdNumber] = useState('');
  const [idFile, setIdFile] = useState<string | null>(null);
  const ready = cacFile !== null && idFile !== null && cac.trim() !== '' && idNumber.trim() !== '';
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!cacFile || !idFile) return;
        void save({
          cacNumber: cac.trim(),
          cacCertificateUploadId: cacFile,
          ownerIdType: idType,
          ownerIdNumber: idNumber.trim(),
          ownerIdUploadId: idFile,
        });
      }}
    >
      <FormTextField
        label={t('onboarding.cacNumber')}
        value={cac}
        onChange={(e) => {
          setCac(e.target.value);
        }}
      />
      <FilePick
        label={t('onboarding.cacFile')}
        purpose="cac_certificate"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onUploaded={setCacFile}
      />
      <Select
        label={t('onboarding.ownerIdType')}
        value={idType}
        options={ID_TYPES.map((v) => ({
          value: v,
          label: t(`onboarding.idType.${v}` as MessageKey),
        }))}
        onChange={(v) => {
          setIdType(v as (typeof ID_TYPES)[number]);
        }}
      />
      <FormTextField
        label={t('onboarding.ownerIdNumber')}
        value={idNumber}
        onChange={(e) => {
          setIdNumber(e.target.value);
        }}
      />
      <FilePick
        label={t('onboarding.ownerIdFile')}
        purpose="owner_id"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onUploaded={setIdFile}
      />
      <StepError error={error} />
      {submitBtn(busy, !ready)}
    </form>
  );
}

/** Step 3: branch pin and daily hours. */
export function LocationStep({ app, onSaved }: StepProps): ReactNode {
  const { busy, error, save } = useSave('location', onSaved);
  const [branchName, setBranchName] = useState(app.location?.branchName ?? '');
  const [address, setAddress] = useState(app.location?.addressLine ?? '');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [prep, setPrep] = useState('15');
  const [opens, setOpens] = useState('09:00');
  const [closes, setCloses] = useState('21:00');
  function submit(e: SyntheticEvent): void {
    e.preventDefault();
    void save({
      branchName: branchName.trim(),
      addressLine: address.trim(),
      lat: Number(lat),
      lng: Number(lng),
      prepMinutes: Number(prep),
      openingHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        opensAt: opens,
        closesAt: closes,
      })),
    });
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <FormTextField
        label={t('onboarding.branchName')}
        value={branchName}
        onChange={(e) => {
          setBranchName(e.target.value);
        }}
      />
      <FormTextField
        label={t('onboarding.address')}
        value={address}
        onChange={(e) => {
          setAddress(e.target.value);
        }}
      />
      <p className="text-caption text-text-muted">{t('onboarding.pinHint')}</p>
      <div className="grid grid-cols-2 gap-3">
        <FormTextField
          label={t('onboarding.lat')}
          inputMode="decimal"
          value={lat}
          onChange={(e) => {
            setLat(e.target.value);
          }}
        />
        <FormTextField
          label={t('onboarding.lng')}
          inputMode="decimal"
          value={lng}
          onChange={(e) => {
            setLng(e.target.value);
          }}
        />
      </div>
      <FormTextField
        label={t('onboarding.prepMinutes')}
        inputMode="numeric"
        value={prep}
        onChange={(e) => {
          setPrep(e.target.value);
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormTextField
          label={t('hours.opens')}
          type="time"
          value={opens}
          onChange={(e) => {
            setOpens(e.target.value);
          }}
        />
        <FormTextField
          label={t('hours.closes')}
          type="time"
          value={closes}
          onChange={(e) => {
            setCloses(e.target.value);
          }}
        />
      </div>
      <StepError error={error} />
      {submitBtn(busy)}
    </form>
  );
}

/** Step 4: CSV menu import with line-numbered errors. */
export function MenuStep({ onSaved }: StepProps): ReactNode {
  const [csv, setCsv] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; lines: string[] } | null>(null);
  const [result, setResult] = useState<MenuImportResult | null>(null);
  async function submit(e: SyntheticEvent): Promise<void> {
    e.preventDefault();
    if (!csv) return;
    setBusy(true);
    setError(null);
    try {
      const c = browserClient();
      setResult(await c.importVendorMenu({ csvUploadId: csv }));
      onSaved(await c.getMyVendorApplication());
    } catch (err) {
      const p = problemLines(err);
      setError({
        message: p.lines.length > 0 ? t('onboarding.menuErrors') : p.message,
        lines: p.lines,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void submit(e)}>
      <a
        href="/api/v1/vendor-applications/menu-template"
        className="text-body font-semibold text-accent-text underline"
        download
      >
        {t('onboarding.menuTemplate')}
      </a>
      <FilePick
        label={t('onboarding.menuCsv')}
        purpose="menu_csv"
        accept=".csv,text/csv"
        onUploaded={setCsv}
      />
      {result ? (
        <p role="status" className="text-body text-success">
          {t('onboarding.menuImported', { items: result.items, categories: result.categories })}
        </p>
      ) : null}
      <StepError error={error} />
      {submitBtn(busy, csv === null)}
    </form>
  );
}

/** Step 5: bank account, resolved by name, with an explicit mismatch confirmation. */
export function BankStep({ onSaved }: StepProps): ReactNode {
  const { busy, error, save } = useSave('bank_account', onSaved);
  const [bankCode, setBankCode] = useState('');
  const [account, setAccount] = useState('');
  const mismatch = error?.code === 'bank_account_name_mismatch';
  const body = (confirm: boolean): VendorStepBodies['bank_account'] => ({
    bankCode: bankCode.trim(),
    accountNumber: account.trim(),
    ...(confirm ? { confirmNameMismatch: true } : {}),
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save(body(false));
      }}
    >
      <FormTextField
        label={t('onboarding.bankCode')}
        inputMode="numeric"
        value={bankCode}
        onChange={(e) => {
          setBankCode(e.target.value);
        }}
      />
      <FormTextField
        label={t('onboarding.accountNumber')}
        inputMode="numeric"
        maxLength={10}
        value={account}
        onChange={(e) => {
          setAccount(e.target.value.replace(/\D/g, ''));
        }}
      />
      {mismatch ? (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-warning p-3">
          <p className="text-body">{t('onboarding.mismatch')}</p>
          <Button variant="ink" loading={busy} onClick={() => void save(body(true))}>
            {t('onboarding.confirmMismatch')}
          </Button>
        </div>
      ) : (
        <StepError error={error} />
      )}
      {submitBtn(busy, account.length !== 10 || bankCode.trim() === '')}
    </form>
  );
}

const CHECKS = [
  'acceptedTestOrder',
  'markedItemUnavailable',
  'markedOrderReady',
  'reviewedPayoutSchedule',
] as const;

/** Step 6: test order walkthrough checklist (every item required). */
export function TestOrderStep({ onSaved }: StepProps): ReactNode {
  const { busy, error, save } = useSave('test_order', onSaved);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const all = CHECKS.every((c) => checked.has(c));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (all)
          void save({
            acceptedTestOrder: true,
            markedItemUnavailable: true,
            markedOrderReady: true,
            reviewedPayoutSchedule: true,
          });
      }}
    >
      {CHECKS.map((c) => (
        <label key={c} className="flex min-h-12 items-center gap-3 text-body">
          <input
            type="checkbox"
            className="h-5 w-5 accent-primary"
            checked={checked.has(c)}
            onChange={(e) => {
              const next = new Set(checked);
              if (e.target.checked) next.add(c);
              else next.delete(c);
              setChecked(next);
            }}
          />
          {t(`onboarding.test.${c}` as MessageKey)}
        </label>
      ))}
      <StepError error={error} />
      {submitBtn(busy, !all)}
    </form>
  );
}

/** Step components by id. */
export const STEP_COMPONENTS: Record<VendorStep, (p: StepProps) => ReactNode> = {
  business_details: BusinessStep,
  documents: DocumentsStep,
  location: LocationStep,
  menu: MenuStep,
  bank_account: BankStep,
  test_order: TestOrderStep,
};
