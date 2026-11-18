import { Inbox } from "lucide-react";
import { useMemo, useState } from "react";
import { WeaveBand } from "../craft/WeaveBand";
import { feedFilters } from "../lib/categories";
import type { AroundPlace, CrowdArea, FeedItem, FeedTop, Tip, TrafficArea } from "../lib/types";
import { inZone, useZone, zoneFirst } from "../lib/zones";
import { CardSkeleton, Chip, EmptyState, SectionHeader } from "../ui";
import { FeedCard } from "./FeedCard";
import { HeroBanner, useDismissedBanner } from "./HeroBanner";
import { AroundTeaser, KnowBeforeYouGo } from "./KnowBeforeYouGo";

const where = (i: FeedItem) => [i.area, i.place?.where, i.place?.name];

function Cards({ items }: { items: FeedItem[] }) {
  return (
    <div className="auto-grid [--min:21rem]">
      {items.map((item) => (
        <FeedCard key={item.id} item={item} />
      ))}
    </div>
  );
}

/**
 * The home page, under the site header (which holds the search prompt, what's on and the menu): the
 * feed, with what to know beside it. With a zone picked in "Where are you?", the zone's posts, roads and
 * spots come first and the rest of Bacolod follows under its own heading, so a quiet zone is never empty.
 * Layout comes from `.now-grid` (src/index.css).
 */
export function NowView({
  feed,
  top,
  traffic,
  crowd,
  tips,
  around,
}: {
  feed: FeedItem[] | undefined;
  /** The hero banner and pins, placed above the feed. */
  top: FeedTop | undefined;
  traffic: TrafficArea[] | undefined;
  crowd?: CrowdArea[];
  tips: Tip[] | undefined;
  around: AroundPlace[] | undefined;
}) {
  const [filter, setFilter] = useState("all");
  const [zone] = useZone();

  const [heroClosed, closeHero] = useDismissedBanner(top?.hero?.id);
  const hero = heroClosed ? null : (top?.hero ?? null);
  const pins = useMemo(() => zoneFirst(top?.pins ?? [], zone, where), [top, zone]);

  // Pinned and banner items show once, above; a banner this device closed goes back to the feed.
  const items = useMemo(() => {
    const above = new Set([hero?.id, ...pins.map((p) => p.id)]);
    const cats = feedFilters.find((f) => f.id === filter)?.categories;
    const all = (feed ?? []).filter((i) => !above.has(i.id));
    return cats ? all.filter((i) => cats.includes(i.category)) : all;
  }, [feed, filter, hero, pins]);

  const near = useMemo(() => (zone ? items.filter((i) => inZone(zone, ...where(i))) : []), [items, zone]);
  const elsewhere = zone ? items.filter((i) => !near.includes(i)) : items;
  const spots = useMemo(() => (around ? zoneFirst(around, zone, (p) => [p.place, p.title]) : undefined), [around, zone]);

  return (
    <div className={hero ? "now-grid with-banner" : "now-grid"}>
      {hero && (
        <div data-area="banner">
          <HeroBanner item={hero} onDismiss={closeHero} />
        </div>
      )}

      <div data-area="side" className="auto-grid [--gap:1.75rem_1.5rem] [--min:18rem]">
        <KnowBeforeYouGo traffic={traffic} crowd={crowd} tips={tips} zone={zone} />
        {spots && spots.length > 0 && <AroundTeaser places={spots} />}
      </div>

      <section data-area="feed" id="feed" className="scroll-mt-24">
        {pins.length > 0 && (
          <div className="mb-7">
            <SectionHeader title="Pinned" subtitle="Stays here until it ends" />
            <Cards items={pins} />
          </div>
        )}
        <WeaveBand className="mb-4">{zone ? `Latest · ${zone.name}` : "Latest"}</WeaveBand>
        <div className="bleed-scroll mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="toolbar" aria-label="Filter feed">
          {feedFilters.map((f) => (
            <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} count={feed && f.categories ? feed.filter((i) => f.categories!.includes(i.category)).length : feed?.length}>
              {f.label}
            </Chip>
          ))}
        </div>
        {!feed && (
          <div className="auto-grid [--min:21rem]">
            {[0, 1, 2].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}
        {zone && items.length > 0 && (
          <>
            {near.length > 0 ? <Cards items={near} /> : <p className="rounded-card bg-surface-sunken p-4 text-sm text-ink-muted">Nothing posted for {zone.name} yet. Here is the rest of Bacolod.</p>}
            {elsewhere.length > 0 && (
              <div className="mt-7">
                <SectionHeader title="Elsewhere in Bacolod" />
                <Cards items={elsewhere} />
              </div>
            )}
          </>
        )}
        {!zone && <Cards items={elsewhere} />}
        {feed && items.length === 0 && (
          <EmptyState icon={Inbox} title="Nothing here yet">
            Updates in this category will show up as soon as they are posted.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
