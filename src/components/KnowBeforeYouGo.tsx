import { ArrowRight } from "lucide-react";
import { isClosedNow } from "../lib/places";
import type { AroundPlace, CrowdArea, Tip, TrafficArea } from "../lib/types";
import type { Zone } from "../lib/zones";
import { placeIcons } from "./AroundView";
import { CrowdStrip } from "./CrowdStrip";
import { TrafficStrip } from "./TrafficStrip";
import { guideIcons } from "./VisitView";

/**
 * What a passive visitor wants before heading out: a few tips and the worst roads. The weather is the
 * header's pill. Sits beside the feed on wide screens and above it on phones.
 */
export function KnowBeforeYouGo({ traffic, crowd, tips, zone }: { traffic?: TrafficArea[]; crowd?: CrowdArea[]; tips?: Tip[]; zone?: Zone | null }) {
  return (
    <>
      {tips && tips.length > 0 && (
        <section className="space-y-3" aria-labelledby="know-title">
          <h2 id="know-title" className="font-display text-title">
            Know before you go
          </h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface-raised shadow-card">
            {tips.slice(0, 2).map((t) => {
              const Icon = guideIcons[t.icon].icon;
              return (
                <li key={t.id} className="flex gap-3 p-3.5">
                  <Icon className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold">{t.title}</p>
                    <p className="text-sm text-ink-muted">{t.body}</p>
                  </div>
                </li>
              );
            })}
            <li>
              <a href={`#/visit/${tips[0].section}`} className="flex h-11 items-center justify-between px-3.5 text-sm font-medium text-primary-ink hover:underline">
                All tips for visitors <ArrowRight className="size-4" aria-hidden />
              </a>
            </li>
          </ul>
        </section>
      )}
      {(traffic || (crowd && crowd.length > 0)) && (
        <div className="space-y-3">
          {traffic && <TrafficStrip areas={traffic} zone={zone} />}
          {crowd && <CrowdStrip areas={crowd} zone={zone} />}
        </div>
      )}
    </>
  );
}

/** A few non-schedule things (promos, rides, thrift) so browsers find more than parades. */
export function AroundTeaser({ places }: { places: AroundPlace[] }) {
  // Restrooms and first aid are for when you need them, not for browsing.
  const spots = places.filter((p) => !p.kind.services && !isClosedNow(p.closedUntil)).slice(0, 3);
  if (!spots.length) return null;
  return (
    <section aria-labelledby="around-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 id="around-title" className="font-display text-title">
          Around the festival
        </h2>
        <a href="#/around" className="inline-flex h-9 items-center gap-1 text-sm font-medium text-primary-ink hover:underline">
          All <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
      <ul className="space-y-2">
        {spots.map((p) => {
          const Icon = placeIcons[p.kind.icon].icon;
          return (
            <li key={p.id}>
              <a href={`#/around/${p.kind.key}`} className="flex items-center gap-3 rounded-card border border-line bg-surface-raised p-3 shadow-card transition hover:border-line-strong">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-surface-sunken text-ink-muted">
                  <Icon className="size-4.5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{p.title}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {p.kind.name} · {p.place}
                  </span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
