import { AlertTriangle, CheckCircle2, Info, OctagonAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

type AlertTone = "info" | "ok" | "warn" | "danger";

const tones: Record<AlertTone, { box: string; icon: LucideIcon }> = {
  info: { box: "bg-info-soft text-info-ink", icon: Info },
  ok: { box: "bg-ok-soft text-ok-ink", icon: CheckCircle2 },
  warn: { box: "bg-warn-soft text-warn-ink", icon: AlertTriangle },
  danger: { box: "bg-danger-soft text-danger-ink", icon: OctagonAlert },
};

/** Inline message for closures, advisories and form results. Danger and warn are announced to screen readers. */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = tones[tone];
  return (
    <div
      role={tone === "danger" || tone === "warn" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-card p-3.5", box, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold">{title}</p>
        {children && <div className="text-sm opacity-90">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}
