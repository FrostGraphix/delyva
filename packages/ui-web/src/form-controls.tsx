import { type InputHTMLAttributes, type ReactElement, useId } from 'react';

/** Text field props. */
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  readonly label: string;
  /** Helper text below the field. */
  readonly hint?: string;
  /** Validation message; marks the field invalid. */
  readonly error?: string | null;
}

/** Labelled input with hint and error wired through aria-describedby. 48 px tall. */
export function TextField({ label, hint, error, id, ...rest }: TextFieldProps): ReactElement {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-caption font-semibold">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="h-12 rounded-lg border border-line bg-surface px-4 text-body text-text focus-visible:outline-2 focus-visible:outline-primary aria-invalid:border-danger"
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="text-micro text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-micro font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Switch props. */
export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  /** Accessible name (visible label elsewhere, or this text). */
  readonly label: string;
  readonly disabled?: boolean;
}

/** Accessible on/off switch (`role="switch"`), 48 px touch target, state shown by text too. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
      className="inline-flex h-12 min-w-12 items-center justify-center focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
    >
      <span
        className={`relative inline-block h-7 w-12 rounded-pill transition-colors duration-micro motion-reduce:transition-none ${checked ? 'bg-primary' : 'bg-ink-300'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-pill bg-surface transition-transform duration-micro motion-reduce:transition-none ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </span>
    </button>
  );
}
