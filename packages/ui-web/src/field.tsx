import type {
  InputHTMLAttributes,
  ReactElement,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

const CONTROL =
  'min-h-12 w-full rounded-md border border-line bg-surface px-3 text-body text-text ' +
  'placeholder:text-text-disabled focus-visible:outline-2 focus-visible:outline-offset-1 ' +
  'focus-visible:outline-primary aria-[invalid=true]:border-danger disabled:opacity-50';

interface FieldChrome {
  /** Visible label (always rendered; never placeholder-only). */
  readonly label: string;
  /** Helper text under the control. */
  readonly hint?: string;
  /** Error message; marks the control invalid and is announced. */
  readonly error?: string | null;
  /** Stable id used to wire label, hint and error. */
  readonly id: string;
}

function describedBy(id: string, hint?: string, error?: string | null): string | undefined {
  const ids: string[] = [];
  if (hint) ids.push(`${id}-hint`);
  if (error) ids.push(`${id}-error`);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function Chrome({
  id,
  label,
  hint,
  error,
  children,
}: FieldChrome & { readonly children: ReactElement }): ReactElement {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption font-semibold text-text">
        {label}
      </label>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className="text-micro text-text-muted">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-micro font-semibold text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Text input props. */
export type TextFieldProps = FieldChrome &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>;

/** Labelled text input. */
export function TextField({ id, label, hint, error, ...rest }: TextFieldProps): ReactElement {
  return (
    <Chrome id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </Chrome>
  );
}

/** Textarea props. */
export type TextAreaFieldProps = FieldChrome &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'id'>;

/** Labelled multi-line input (e.g. an audit reason). */
export function TextAreaField({
  id,
  label,
  hint,
  error,
  ...rest
}: TextAreaFieldProps): ReactElement {
  return (
    <Chrome id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        rows={3}
        className={`${CONTROL} py-2`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      />
    </Chrome>
  );
}

/** Select option. */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** Select props. */
export type SelectFieldProps = FieldChrome &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'id'> & {
    readonly options: readonly SelectOption[];
  };

/** Labelled native select. */
export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  ...rest
}: SelectFieldProps): ReactElement {
  return (
    <Chrome id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Chrome>
  );
}
