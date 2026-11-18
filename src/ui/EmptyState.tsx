import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-full bg-surface-sunken text-ink-muted">
        <Icon className="size-6" aria-hidden />
      </div>
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1 max-w-xs text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
