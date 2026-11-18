import { cn } from "./cn";

/** Pulsing dot for "live" and "happening now". The pulse stops when reduced motion is on. */
export function LiveDot({ tone = "danger", className }: { tone?: "danger" | "ok" | "brand"; className?: string }) {
  const color = { danger: "bg-danger", ok: "bg-ok", brand: "bg-primary" }[tone];
  return (
    <span aria-hidden className={cn("relative inline-flex size-2", className)}>
      <span className={cn("absolute inset-0 animate-live rounded-full", color)} />
      <span className={cn("relative size-2 rounded-full", color)} />
    </span>
  );
}
