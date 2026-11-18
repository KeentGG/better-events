import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "brand" | "gold" | "ok" | "warn" | "danger" | "info" | "neutral";

const soft: Record<BadgeTone, string> = {
  brand: "bg-primary-soft text-primary-ink",
  gold: "bg-accent-soft text-accent-ink",
  ok: "bg-ok-soft text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  danger: "bg-danger-soft text-danger-ink",
  info: "bg-info-soft text-info-ink",
  neutral: "bg-surface-sunken text-ink-muted",
};

const solid: Record<BadgeTone, string> = {
  brand: "bg-primary text-white",
  gold: "bg-accent text-neutral-900",
  ok: "bg-ok text-white",
  warn: "bg-warn text-neutral-900",
  danger: "bg-danger text-white",
  info: "bg-info text-white",
  neutral: "bg-surface-inverse text-ink-inverse",
};

export function Badge({
  tone = "neutral",
  variant = "soft",
  icon,
  children,
  className,
  topic,
}: {
  tone?: BadgeTone;
  variant?: "soft" | "solid";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Marks the chip naming what the card is (its category or kind), which .for-you cards tint blue. */
  topic?: boolean;
}) {
  return (
    <span
      data-topic-chip={topic || undefined}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-chip px-2 text-xs font-semibold whitespace-nowrap [&>svg]:size-3.5",
        variant === "soft" ? soft[tone] : solid[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
