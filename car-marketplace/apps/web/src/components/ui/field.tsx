import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

const control =
  "block w-full min-h-12 rounded-[var(--radius-control)] border bg-surface px-3.5 text-base text-ink " +
  "placeholder:text-muted/70 transition-colors focus-visible:outline-none focus-visible:ring-3 " +
  "focus-visible:ring-forest/30 focus-visible:border-forest disabled:bg-paper disabled:text-muted";

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

/** Label, control, hint and error wired together for screen readers. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

type InputProps = ComponentProps<"input"> & { invalid?: boolean };

export function Input({ invalid, className, ...props }: InputProps) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={clsx(control, invalid ? "border-danger" : "border-mist hover:border-ink/30", className)}
    />
  );
}

type SelectProps = ComponentProps<"select"> & { invalid?: boolean };

export function Select({ invalid, className, children, ...props }: SelectProps) {
  return (
    <select
      {...props}
      aria-invalid={invalid || undefined}
      className={clsx(
        control,
        "appearance-none bg-[length:1.25rem] bg-[right_0.75rem_center] bg-no-repeat pr-10",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%234e5f58'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5'/%3E%3C/svg%3E\")]",
        invalid ? "border-danger" : "border-mist hover:border-ink/30",
        className,
      )}
    >
      {children}
    </select>
  );
}

type TextareaProps = ComponentProps<"textarea"> & { invalid?: boolean };

export function Textarea({ invalid, className, ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      aria-invalid={invalid || undefined}
      className={clsx(control, "min-h-32 py-3 leading-relaxed", invalid ? "border-danger" : "border-mist hover:border-ink/30", className)}
    />
  );
}

/** A checkbox that looks like a chip: for multi-select lists such as car features. */
export function ChipCheckbox({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="cursor-pointer select-none">
      <input type="checkbox" {...props} className="peer sr-only" />
      <span className="inline-flex min-h-10 items-center rounded-full border border-mist bg-surface px-3.5 text-sm font-medium text-ink transition-colors peer-checked:border-forest peer-checked:bg-forest peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-forest hover:border-ink/30">
        {label}
      </span>
    </label>
  );
}

/** A labelled single checkbox. */
export function Checkbox({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" {...props} className="mt-0.5 size-5 shrink-0 accent-forest" />
      <span>
        <span className="font-semibold text-ink">{label}</span>
        {hint ? <span className="block text-sm text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
