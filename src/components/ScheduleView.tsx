import { resolveEventId } from "../lib/occurrences";
import { CalendarX, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { WeaveBand } from "../craft/WeaveBand";
import { splitDays } from "../lib/scheduleDays";
import { dayKey, dayLabel } from "../lib/time";
import type { ScheduleEvent, WeatherNow } from "../lib/types";
import { CardSkeleton, cn, EmptyState } from "../ui";
import { hasResults } from "../lib/eventPhase";
import { Timeline } from "./Timeline";

/** A date strip on bamboo cross-hatch, with a gold edge like a bookmark. */
function DateStrip({ iso }: { iso: string }) {
  return (
    <div className="sawali bleed bleed-panel relative flex h-11 items-center justify-center border-y border-line bg-surface-band">
      <h2 className="rounded-control bg-surface-band px-3 py-0.5 font-mono text-sm tracking-wide text-ink">{dayLabel(iso)}</h2>
    </div>
  );
}

/**
 * Days stack on a phone and sit side by side, like a planner, when the content column has room.
 * `focus` is an event id to scroll to and flash, for links from search.
 */
export function ScheduleView({ events, focus: asked, weather }: { events: ScheduleEvent[] | undefined; focus?: string; weather?: WeatherNow }) {
  // A daily event's own id (from a "During" link) stands for its night that is on now or next.
  const focus = asked && events ? resolveEventId(events, asked, Date.now()) : asked;
  // The reader's own choice, once they've made one; a newly linked event clears it so it can be found.
  const [showPast, setShowPast] = useState<boolean>();
  const [seenFocus, setSeenFocus] = useState(focus);
  if (focus !== seenFocus) {
    setSeenFocus(focus);
    setShowPast(undefined);
  }
  useEffect(() => {
    if (!focus || !events) return;
    const el = document.getElementById(`event-${focus}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash");
    const t = setTimeout(() => el.classList.remove("flash"), 2400);
    return () => clearTimeout(t);
  }, [focus, events]);

  if (!events) return <CardSkeleton />;
  if (events.length === 0)
    return (
      <EmptyState icon={CalendarX} title="No events posted yet">
        The official schedule shows up here as soon as it is announced.
      </EmptyState>
    );

  const days = new Map<string, ScheduleEvent[]>();
  for (const e of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const k = dayKey(e.startsAt);
    days.set(k, [...(days.get(k) ?? []), e]);
  }
  // Days already over fold behind one button, so the schedule opens on today. A search link into one opens them.
  const today = dayKey(new Date().toISOString());
  const { past, upcoming } = splitDays([...days.entries()], today, Date.now());
  const pastResults = past.flat().filter(hasResults).length;
  const openPast = showPast ?? past.some((list) => list.some((e) => e.id === focus));

  return (
    <div className="space-y-6">
      <WeaveBand>Schedule</WeaveBand>
      {past.length > 0 && (
        <button
          type="button"
          aria-expanded={openPast}
          onClick={() => setShowPast(!openPast)}
          className="inline-flex h-9 items-center gap-1.5 rounded-chip border border-line bg-surface-raised px-3.5 text-sm font-medium text-ink-muted shadow-card hover:text-ink"
        >
          <ChevronDown className={cn("size-4 transition-transform", openPast && "rotate-180")} aria-hidden />
          {openPast ? "Hide" : "Show"} {past.length} earlier {past.length === 1 ? "day" : "days"}
          {pastResults > 0 && ` · ${pastResults} with results`}
        </button>
      )}
      <div className="auto-grid [--gap:1.5rem_2rem] [--min:30rem]">
        {[...(openPast ? past : []), ...upcoming].map((list) => (
          <section key={list[0].id} className="space-y-3">
            <DateStrip iso={list[0].startsAt} />
            <Timeline events={list} weather={weather} focus={focus} earlierOpen={past.includes(list)} />
          </section>
        ))}
      </div>
    </div>
  );
}
