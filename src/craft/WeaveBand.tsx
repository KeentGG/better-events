import type { ReactNode } from "react";
import { cn } from "../ui";

/**
 * A woven banig band with a label in the middle, for section breaks (see docs/DESIGN_SYSTEM.md).
 * The pattern is decoration; the label is the section's real heading.
 */
export function WeaveBand({ children, as: Tag = "h2", className }: { children: ReactNode; as?: "h2" | "h3" | "p"; className?: string }) {
  return (
    <div
      className={cn(
        "weave weave-accents bleed bleed-panel flex h-[2.25rem] items-center justify-center border-y border-line/70 bg-surface-band",
        className,
      )}
    >
      {/* The plate fades into the weave at both ends instead of stopping on a hard edge. */}
      <Tag className="relative flex h-full items-center bg-[linear-gradient(90deg,transparent,var(--color-surface-band)_1.75rem,var(--color-surface-band)_calc(100%-1.75rem),transparent)] px-10 text-[0.9375rem] font-bold tracking-[0.1em] text-accent-ink uppercase">
        {children}
      </Tag>
    </div>
  );
}

/** A thin woven ribbon with no label, for edges (the top bar, the hero). */
export function WeaveRibbon({ className }: { className?: string }) {
  return <div aria-hidden className={cn("weave h-2.5 border-y border-line/70 bg-surface-band", className)} />;
}
