import { ArrowRight, Car } from "lucide-react";
import { timeAgo } from "../lib/time";
import type { TrafficStatus } from "../lib/trafficLabel";
import type { TrafficArea, TrafficLevel } from "../lib/types";
import { zoneFirst, type Zone } from "../lib/zones";
import { cn, SectionHeader } from "../ui";

export const trafficLevels: Record<TrafficLevel, { label: string; bar: string; text: string; fill: number }> = {
  clear: { label: "Clear", bar: "bg-ok", text: "text-ok-ink", fill: 1 },
  moderate: { label: "Moderate", bar: "bg-warn", text: "text-warn-ink", fill: 2 },
  heavy: { label: "Heavy", bar: "bg-danger", text: "text-danger-ink", fill: 3 },
  partial: { label: "Partly closed", bar: "bg-danger", text: "text-danger-ink", fill: 4 },
  closed: { label: "Closed", bar: "bg-danger", text: "text-danger-ink", fill: 5 },
};

/** Worst first, so a short list always shows the closures. */
export function bySeverity(areas: TrafficArea[]) {
  return [...areas].sort((a, b) => trafficLevels[b.level].fill - trafficLevels[a.level].fill || b.reports - a.reports);
}

/** The road picked on the map or in a list: the amber outline used for marked things elsewhere. */
export const selectedCard = "border-accent ring-2 ring-accent";

/**
 * How bad it is, drawn the way the map draws it: three steps for moving traffic, and the map's
 * broken red line for a road that is shut (longer dashes when only part of it is), so nobody reads a
 * closure as "very heavy".
 */
export function LevelMeter({ level }: { level: TrafficLevel }) {
  const l = trafficLevels[level];
  if (level === "closed")
    return <div className="h-1.5 rounded-full text-danger [background:repeating-linear-gradient(90deg,currentColor_0_0.5rem,transparent_0.5rem_0.8125rem)]" aria-hidden />;
  if (level === "partial")
    return <div className="h-1.5 rounded-full text-danger [background:repeating-linear-gradient(90deg,currentColor_0_1.5rem,transparent_1.5rem_1.8125rem)]" aria-hidden />;
  return (
    <div className="flex gap-1" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= l.fill ? l.bar : "bg-surface-sunken")} />
      ))}
    </div>
  );
}

export function TrafficTile({ a, selected, onSelect, status }: { a: TrafficArea; selected?: boolean; onSelect?: () => void; status?: TrafficStatus }) {
  const l = trafficLevels[a.level];
  const advisory = status?.kind === "advisory";
  const body = (
    <>
      <p className="text-sm font-semibold text-balance">{a.area}</p>
      <p className={cn("mt-0.5 text-sm font-semibold text-balance", advisory ? "text-warn-ink" : l.text)}>{status?.headline ?? l.label}</p>
      {status?.hours && <p className="text-sm text-ink-muted tabular-nums">{status.hours}</p>}
      <div className="mt-2">
        <LevelMeter level={a.level} />
      </div>
      <p className="mt-2 text-xs text-ink-subtle">
        {a.reports === 1 ? "Updated" : `${a.reports} reports · latest`} {timeAgo(a.updatedAt)}
      </p>
    </>
  );
  const cls = cn("block w-full rounded-card border bg-surface-raised p-3 text-left shadow-card", selected ? selectedCard : "border-line");
  return onSelect ? (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={cn(cls, "transition hover:border-line-strong")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * The busiest areas as a small grid: two across on a phone or in a side panel, more when there is room.
 * With a zone picked, its roads come first.
 */
export function TrafficStrip({ areas, limit = 4, zone = null }: { areas: TrafficArea[]; limit?: number; zone?: Zone | null }) {
  const shown = zoneFirst(bySeverity(areas), zone, (a) => [a.area]).slice(0, limit);
  return (
    <section>
      <SectionHeader
        title="Traffic now"
        subtitle="From advisories and reports, last 90 minutes"
        action={
          <a href="#/traffic" className="inline-flex h-9 items-center gap-1 text-sm font-medium text-primary-ink hover:underline">
            Map <ArrowRight className="size-4" aria-hidden />
          </a>
        }
      />
      {areas.length === 0 ? (
        <p className="flex items-center gap-2 rounded-card bg-surface-sunken p-3 text-sm text-ink-muted">
          <Car className="size-4" aria-hidden /> No traffic reports right now.
        </p>
      ) : (
        <ul className="auto-grid [--gap:0.625rem] [--min:8.5rem]">
          {shown.map((a) => (
            <li key={a.area}>
              <TrafficTile a={a} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
