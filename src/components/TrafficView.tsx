import { Car } from "lucide-react";
import type { FeatureCollection } from "geojson";
import { useEffect, useMemo, useState } from "react";
import roads from "../data/bacolod-roads.json";
import { categoryMeta, feedFilters } from "../lib/categories";
import { trafficAgenda } from "../lib/trafficLabel";
import type { CrowdArea, FeedItem, ScheduleEvent, TrafficArea } from "../lib/types";
import { venueMarks } from "../lib/venueMarks";
import { Badge, CardSkeleton, cn, EmptyState, SectionHeader } from "../ui";
import { CrowdList } from "./CrowdStrip";
import { FeedCard } from "./FeedCard";
import { TrafficMap } from "./TrafficMap";
import { selectedCard, TrafficTile } from "./TrafficStrip";

const trafficCategories = feedFilters.find((f) => f.id === "traffic")!.categories!;

/** The same chip the advisory cards below wear, so a closure looks like one thing on the page. */
function CategoryBadge({ category }: { category: FeedItem["category"] }) {
  const meta = categoryMeta[category];
  const Icon = meta.icon;
  return (
    <Badge tone={meta.tone} icon={<Icon aria-hidden />}>
      {meta.label}
    </Badge>
  );
}

/**
 * For people who need to get somewhere: the map, with each area's level beside it, then the official
 * advisories in their own section underneath. Picking a road on the map or in the list narrows the advisories to it.
 * `detail` is an area name to preselect, or "advisories" to jump to the list.
 */
export function TrafficView({ areas, crowd, feed, schedule, detail }: { areas: TrafficArea[] | undefined; crowd?: CrowdArea[]; feed: FeedItem[] | undefined; schedule?: ScheduleEvent[]; detail: string | undefined }) {
  const [selected, setSelected] = useState<string | undefined>(detail && detail !== "advisories" ? decodeURIComponent(detail) : undefined);

  useEffect(() => {
    if (detail === "advisories" && feed) document.getElementById("advisories")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [detail, feed]);

  const venues = useMemo(() => venueMarks(schedule, roads as FeatureCollection), [schedule]);
  const advisories = (feed ?? []).filter((i) => trafficCategories.includes(i.category) && (!selected || i.area === selected));
  const agenda = trafficAgenda(areas ?? [], feed);
  const toggle = (area: string) => setSelected(selected === area ? undefined : area);
  // The days sit under the map, so picking a road from them brings the map back to show it.
  const showOnMap = (area: string) => {
    toggle(area);
    if (selected !== area) document.getElementById("traffic-map")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <p className="font-mono text-xs tracking-[0.18em] text-ink-muted uppercase">Getting around</p>
        <h1 className="text-hero mt-2 font-display text-balance">Traffic and closures</h1>
        <p className="mt-1.5 text-ink-muted">What's closed or slow right now, how crowded the busy places are, and the closures already announced. Tap a road to see what's been posted about it.</p>
      </header>

      {!areas ? (
        <CardSkeleton />
      ) : (
        <div className="split [--main:30rem] [--side:17rem]">
          <div id="traffic-map" className="split-main scroll-mt-24">
            <TrafficMap areas={areas} crowd={crowd} feed={feed} venues={venues} selected={selected} onSelect={setSelected} />
            {crowd && crowd.length > 0 && (
              <div className="mt-6">
                <CrowdList areas={crowd} />
              </div>
            )}
          </div>
          <div className="split-side">
            <section>
              <SectionHeader title="Right now" subtitle={agenda.live.length ? "Worst first" : undefined} />
              {agenda.live.length === 0 ? (
                <p className="flex items-center gap-2 rounded-card bg-surface-sunken p-3 text-sm text-ink-muted">
                  <Car className="size-4 shrink-0" aria-hidden /> No closures or heavy traffic reported right now.
                </p>
              ) : (
                <ul className="auto-grid [--gap:0.625rem] [--min:8.5rem]">
                  {agenda.live.map(({ area: a, status }) => (
                    <li key={a.area}>
                      <TrafficTile a={a} status={status} selected={selected === a.area} onSelect={() => toggle(a.area)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {agenda.ahead.length > 0 && (
            <section className="split-span">
              <SectionHeader title="Coming up" subtitle="Roads are open until then" />
              <ol className="auto-grid [--gap:0.875rem] [--min:13rem]">
                {agenda.ahead.map((d) => (
                  <li key={d.day}>
                    <h3 className="mb-1.5 font-mono text-xs tracking-[0.14em] text-ink-muted uppercase">{d.day}</h3>
                    <ul className="space-y-2">
                      {d.rows.map(({ area: a, status }) => (
                        <li key={a.area}>
                          <button
                            type="button"
                            onClick={() => showOnMap(a.area)}
                            aria-pressed={selected === a.area}
                            className={cn(
                              "block w-full rounded-card border bg-surface-raised px-3 py-2.5 text-left shadow-card transition hover:border-line-strong",
                              selected === a.area ? selectedCard : "border-line",
                            )}
                          >
                            <CategoryBadge category={status.kind === "closure" ? "road_closure" : "traffic_advisory"} />
                            <span className="mt-1.5 block text-sm font-semibold text-balance">{a.area}</span>
                            <span className="block text-sm text-ink-muted tabular-nums">{status.hours}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section id="advisories" className="split-span scroll-mt-24">
            <SectionHeader
              title="Advisories"
              action={
                selected && (
                  <button type="button" onClick={() => setSelected(undefined)} className="h-9 text-sm font-medium text-primary-ink hover:underline">
                    Show all
                  </button>
                )
              }
            />
            <div className="space-y-3">
              {!feed && <CardSkeleton />}
              {advisories.map((item) => (
                <FeedCard key={item.id} item={item} />
              ))}
              {feed && advisories.length === 0 && (
                <EmptyState icon={Car} title="No advisories">
                  {selected ? `Nothing posted about ${selected} yet.` : "Road advisories show up here as soon as they are posted."}
                </EmptyState>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
