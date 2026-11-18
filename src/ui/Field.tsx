import { useId, type ComponentProps, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-control border border-line-strong bg-surface-raised px-3.5 text-base text-ink placeholder:text-ink-subtle transition duration-150 outline-none focus:border-focus focus:ring-3 focus:ring-focus/25 aria-invalid:border-danger aria-invalid:ring-danger/20 disabled:opacity-50";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}

/** Label, hint and error wiring for any control. Inputs use 16px text so iOS does not zoom on focus. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, "aria-describedby": described, "aria-invalid": error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger-ink">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-sm text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 py-2.5", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "h-11 appearance-none bg-[length:1rem] bg-[right_0.875rem_center] bg-no-repeat pr-10", className)} style={{ backgroundImage: chevron }} {...props}>
      {children}
    </select>
  );
}

const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;
