import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/** Toggleable filter pill. Use inside a horizontally scrolling row on mobile. */
export function Chip({
  active,
  icon,
  count,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-chip border px-3.5 text-sm font-medium transition duration-150 ease-out-quint active:scale-[0.97] [&>svg]:size-4",
        active
          ? "border-transparent bg-surface-inverse text-ink-inverse"
          : "border-line bg-surface-raised text-ink-muted hover:border-line-strong hover:text-ink",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {count !== undefined && (
        <span className={cn("rounded-chip px-1.5 text-xs tabular-nums", active ? "bg-white/20" : "bg-surface-sunken")}>
          {count}
        </span>
      )}
    </button>
  );
}
