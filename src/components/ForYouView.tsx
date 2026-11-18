import { ArrowRight, Plus, SearchX, X } from "lucide-react";
import { useState } from "react";
import { WeaveBand } from "../craft/WeaveBand";
import { dayKey, dayLabel } from "../lib/time";
import { matchTopic, topicIcon, topicIndex, usePreferences, useTopicTree } from "../lib/interests";
import type { AroundPlace, FeedItem, ScheduleEvent, TopicNode } from "../lib/types";
import { Button, CardSkeleton, Chip, EmptyState, SectionHeader } from "../ui";
import { PlaceCard } from "./AroundView";
import { FeedCard } from "./FeedCard";
import { TopicChips } from "./InterestDock";
import { phaseOf, Timeline } from "./Timeline";

export interface ForYouData {
  feed?: FeedItem[];
  schedule?: ScheduleEvent[];
  around?: AroundPlace[];
}

/** What matches the visitor's interests: events live or still to come, items, and places to go (a venue is where an event is, not a pick of its own). */
export function forYou(prefs: readonly string[], d: ForYouData) {
  const now = Date.now();
  const hit = (t: string[] | undefined) => matchTopic(prefs, t) !== null;
  return {
    events: (d.schedule ?? []).filter((e) => hit(e.topics) && (phaseOf(e, now) === "live" || phaseOf(e, now) === "next")).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    items: (d.feed ?? []).filter((i) => hit(i.topics)),
    places: (d.around ?? []).filter((p) => p.kind.key !== "venue" && hit(p.topics)),
  };
}

function byDay(events: ScheduleEvent[]) {
  const days = new Map<string, ScheduleEvent[]>();
  for (const e of events) days.set(dayKey(e.startsAt), [...(days.get(dayKey(e.startsAt)) ?? []), e]);
  return [...days.values()];
}

/** Topics next to the chosen ones that have something on: siblings under the same parent, or other roots. */
function suggestions(prefs: readonly string[], tree: TopicNode[]) {
  const nodes = topicIndex(tree);
  const parents = new Set(prefs.map((k) => (k.includes(".") ? k.split(".")[0] : null)));
  const pool = parents.has(null) ? tree : tree.filter((t) => parents.has(t.key)).flatMap((t) => t.children);
  return pool.filter((n) => n.count + n.places > 0 && !prefs.includes(n.key) && nodes.has(n.key)).slice(0, 6);
}

/** How many days of later events show before "Show more days". */
const DAYS_SHOWN = 3;

/** `#/foryou`: everything on for the topics this visitor picked, today first. Picking and editing happen here. */
export function ForYouView({ data }: { data: ForYouData }) {
  const { topics: prefs, remove, toggle } = usePreferences();
  const tree = useTopicTree();
  const nodes = topicIndex(tree);
  const name = (k: string) => nodes.get(k)?.name ?? k;
  // First visit opens on the picker; after that it is one tap away.
  const [editing, setEditing] = useState(prefs.length === 0);
  const [allDays, setAllDays] = useState(false);
  const { events, items, places } = forYou(prefs, data);
  const found = events.length + items.length + places.length;

  if (editing || !prefs.length)
    return (
      <div className="space-y-6">
        <WeaveBand>For you</WeaveBand>
        <div className="mx-auto max-w-2xl space-y-6">
          <header>
            <h2 className="font-display text-title">What are you into?</h2>
            <p className="mt-1 text-ink-muted">
              Pick as many as you like. We'll gather their events, news and places here, and mark them across the app. Numbers show what's still to come.
            </p>
          </header>
          <TopicChips tree={tree} />
          <p className="text-caption text-ink-muted">Saved on this device. No account needed.</p>
          {/* Only once there is a pick, so it never sits over the chips for nothing. */}
          {prefs.length > 0 && (
            <div className="sticky bottom-4 z-10">
              <Button block size="lg" className="shadow-overlay" icon={<ArrowRight className="size-5" aria-hidden />} onClick={() => setEditing(false)}>
                {found ? `See what's on for you (${found})` : "Done"}
              </Button>
            </div>
          )}
        </div>
      </div>
    );

  if (!data.feed && !data.schedule && !data.around) return <CardSkeleton />;
  const others = tree ? suggestions(prefs, tree) : [];
  const today = dayKey(new Date().toISOString());
  const days = byDay(events);
  const now = days.filter((d) => dayKey(d[0].startsAt) <= today);
  const later = days.filter((d) => dayKey(d[0].startsAt) > today);
  const hiddenDays = allDays ? 0 : Math.max(0, later.length - DAYS_SHOWN);

  return (
    <div className="space-y-7">
      <WeaveBand>For you</WeaveBand>
      <div className="flex flex-wrap items-center gap-2" aria-label="Your interests">
        {prefs.map((k) => {
          const Icon = topicIcon(nodes.get(k)?.icon);
          return (
            <Chip key={k} active className="for-you-on" icon={<Icon aria-hidden />} onClick={() => remove(k)} aria-label={`Stop following ${name(k)}`}>
              {name(k)} <X className="size-3.5" aria-hidden />
            </Chip>
          );
        })}
        <Chip icon={<Plus aria-hidden />} onClick={() => setEditing(true)}>
          Add or change
        </Chip>
      </div>

      {!found ? (
        <EmptyState
          icon={SearchX}
          title={`Nothing on for ${prefs.map(name).join(", ")} right now`}
          action={
            others.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {others.map((n) => {
                  const Icon = topicIcon(n.icon);
                  return (
                    <Chip key={n.key} icon={<Icon aria-hidden />} count={n.count} onClick={() => toggle(n.key)}>
                      {n.name}
                    </Chip>
                  );
                })}
              </div>
            )
          }
        >
          {others.length ? "These have something coming up:" : "Check back later; new posts show up here as they come in."}
        </EmptyState>
      ) : (
        <>
          {now.length > 0 && (
            <section>
              <SectionHeader title="Today" />
              <div className="space-y-4">
                {now.map((list, i) => (
                  <Timeline key={list[0].id} events={list} featureLive={i === 0} />
                ))}
              </div>
            </section>
          )}
          {later.length > 0 && (
            <section>
              <SectionHeader title="Coming up" subtitle={`${later.flat().length} more over ${later.length} ${later.length === 1 ? "day" : "days"}`} />
              <div className="space-y-4">
                {later.slice(0, later.length - hiddenDays).map((list) => (
                  <div key={list[0].id} className="space-y-2">
                    <h3 className="font-mono text-sm tracking-wide text-ink-muted">{dayLabel(list[0].startsAt)}</h3>
                    <Timeline events={list} />
                  </div>
                ))}
              </div>
              {hiddenDays > 0 && (
                <Button block variant="secondary" className="mt-4" onClick={() => setAllDays(true)}>
                  Show {hiddenDays} more {hiddenDays === 1 ? "day" : "days"}
                </Button>
              )}
            </section>
          )}
          {items.length > 0 && (
            <section>
              <SectionHeader title="Latest news" />
              <ul className="auto-grid [--min:20rem]">
                {items.map((i) => (
                  <li key={i.id}>
                    <FeedCard item={i} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {places.length > 0 && (
            <section>
              <SectionHeader title="Places" />
              <ul className="auto-grid items-stretch [--min:17rem]">
                {places.map((p) => (
                  <li key={p.id} className="h-full">
                    <PlaceCard p={p} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
