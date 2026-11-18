import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--color-surface-sunken)_25%,var(--color-line)_50%,var(--color-surface-sunken)_75%)] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

/** Placeholder with the same shape as a feed card. */
export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-card border border-line bg-surface-raised p-4" aria-hidden>
      <div className="flex gap-2">
        <Skeleton className="h-6 w-24 rounded-chip" />
        <Skeleton className="h-6 w-16 rounded-chip" />
      </div>
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
