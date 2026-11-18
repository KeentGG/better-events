import { cn } from "./cn";

/** Two to four mutually exclusive views, e.g. Today / Tomorrow on the schedule. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap rounded-control bg-surface-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 min-w-fit flex-1 px-2.5 rounded-[calc(var(--radius-control)-0.25rem)] text-sm font-medium transition duration-150 ease-out-quint",
            value === o.value ? "bg-surface-raised text-ink shadow-card" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
