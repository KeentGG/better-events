import { Users } from "lucide-react";
import { crowdByLevel, crowdLabel } from "../lib/crowd";
import { clock } from "../lib/time";
import type { CrowdArea } from "../lib/types";
import { zoneFirst, type Zone } from "../lib/zones";
import { cn } from "../ui";

/** The same ok / warn / danger the traffic levels use, so quiet, busy and packed read like clear, moderate and heavy. */
export const crowdTone: Record<CrowdArea["level"], { text: string; dot: string }> = {
  quiet: { text: "text-ok-ink", dot: "bg-ok" },
  busy: { text: "text-warn-ink", dot: "bg-warn" },
  packed: { text: "text-danger-ink", dot: "bg-danger" },
};

/**
 * One line under the traffic strip: "Public Plaza packed · Lacson St busy", with when it was last reported.
 * Nothing at all while there are no live readings. With a zone picked, its places come first.
 */
export function CrowdStrip({ areas, zone = null, limit = 4 }: { areas: CrowdArea[]; zone?: Zone | null; limit?: number }) {
  if (areas.length === 0) return null;
  const sorted = zoneFirst(crowdByLevel(areas), zone, (a) => [a.area]);
  const shown = sorted.slice(0, limit);
  const newest = areas.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card bg-surface-sunken p-3 text-sm">
      <Users className="size-4 shrink-0 text-ink-muted" aria-hidden />
      <span className="sr-only">Crowds now:</span>
      {shown.map((a, i) => (
        <span key={a.area} className="inline-flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-ink-subtle">·</span>}
          <span className={cn("size-2 rounded-full", crowdTone[a.level].dot)} aria-hidden />
          <span className="font-semibold">{a.area}</span>
          <span className={cn("font-semibold", crowdTone[a.level].text)}>{crowdLabel[a.level].toLowerCase()}</span>
        </span>
      ))}
      {sorted.length > shown.length && (
        <a href="#/traffic" className="font-medium text-primary-ink hover:underline">
          +{sorted.length - shown.length} more
        </a>
      )}
      <span className="text-xs text-ink-subtle">as of {clock(newest.updatedAt)}</span>
    </p>
  );
}

/** Every live crowd reading as a list, packed first: for the page under the map, and for anyone who can't use the map. */
export function CrowdList({ areas }: { areas: CrowdArea[] }) {
  if (areas.length === 0) return null;
  return (
    <section aria-labelledby="crowd-list-title">
      <h2 id="crowd-list-title" className="font-display text-title">
        Crowds now
      </h2>
      <p className="mb-2 text-sm text-ink-muted">Shown on the map as rings. Reports fade after 90 minutes.</p>
      <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised shadow-card">
        {crowdByLevel(areas).map((a) => (
          <li key={a.area} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3.5 py-2.5">
            <span className="text-sm font-semibold">{a.area}</span>
            <span className={cn("text-sm font-semibold", crowdTone[a.level].text)}>{crowdLabel[a.level]}</span>
            {a.note && <span className="text-sm text-ink-muted">{a.note}</span>}
            <span className="ml-auto text-xs text-ink-subtle">as of {clock(a.updatedAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
