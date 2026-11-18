import { ArrowRight, Heart, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { topicIcon, topicIndex, usePreferences, useTopicTree } from "../lib/interests";
import type { TopicNode } from "../lib/types";
import { Chip, cn, IconButton, Spinner } from "../ui";

/** "12 coming up · 3 today", "4 places", or "Nothing listed yet" for a topic. */
function onFor(t: TopicNode) {
  if (t.count === 0) return t.places ? `${t.places} ${t.places === 1 ? "place" : "places"}` : "Nothing listed yet";
  return `${t.count} coming up${t.today ? ` · ${t.today} today` : ""}`;
}

/** Nothing to find for it yet. Still pickable, so people can follow something before it is listed. */
const quiet = (t: TopicNode) => t.count === 0 && t.places === 0;

/**
 * Everything a visitor can follow, all in view. A topic with kinds under it is a titled group: "All" and
 * then each kind. Topics without kinds sit together in a row between the groups. The number on a chip is
 * what is still to come for it.
 */
export function TopicChips({ tree }: { tree: TopicNode[] | undefined }) {
  const { topics: prefs, toggle, dropChild } = usePreferences();
  if (!tree) return <Spinner />;
  const picked = (key: string) => prefs.includes(key);
  // Neighbouring topics without kinds share one row.
  const blocks: Array<TopicNode | TopicNode[]> = [];
  for (const t of tree) {
    const last = blocks[blocks.length - 1];
    if (t.children.length) blocks.push(t);
    else if (Array.isArray(last)) last.push(t);
    else blocks.push([t]);
  }
  const chip = (t: TopicNode, on: boolean, onClick: () => void, label: string = t.name, icon = true) => {
    const Icon = topicIcon(t.icon);
    return (
      <Chip key={t.key} active={on} icon={icon && t.icon ? <Icon aria-hidden /> : undefined} count={t.count || undefined} className={cn(on && "for-you-on", quiet(t) && !on && "opacity-60")} onClick={onClick}>
        {label}
      </Chip>
    );
  };
  return (
    <div className="space-y-5">
      {blocks.map((b) => {
        if (Array.isArray(b))
          return (
            <div key={b[0].key} className="flex flex-wrap gap-2">
              {b.map((t) => chip(t, picked(t.key), () => toggle(t.key)))}
            </div>
          );
        const Icon = topicIcon(b.icon);
        const all = picked(b.key);
        return (
          <section key={b.key} aria-label={b.name}>
            <h3 className="mb-2 flex flex-wrap items-center gap-x-2 text-sm font-semibold">
              <Icon className="size-4 text-ink-muted" aria-hidden />
              {b.name}
              <span className="font-normal text-ink-muted">{onFor(b)}</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {chip(b, all, () => toggle(b.key), `All ${b.name.toLowerCase()}`, false)}
              {b.children.map((c) =>
                // With "All" on, every kind shows as on; tapping one takes just that kind out.
                chip(c, all || picked(c.key), () => (all ? dropChild(b.key, c.key, b.children.map((x) => x.key)) : toggle(c.key))),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The visitor's interests, floating bottom-right on public pages: a pill with the chosen topics' icons
 * (or "What are you into?") that opens the picker, and a link to the For you page.
 * The For you page has its own picker, so the dock stays off it.
 */
export function InterestDock() {
  const { topics: prefs } = usePreferences();
  const tree = useTopicTree();
  const nodes = topicIndex(tree);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !panel.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => (window.removeEventListener("keydown", onKey), window.removeEventListener("pointerdown", onDown));
  }, [open]);

  const chosen = prefs.map((k) => nodes.get(k)).filter((n): n is TopicNode => !!n);

  return createPortal(
    <div
      ref={panel}
      className="pointer-events-none fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-30 flex flex-col items-end gap-2 lg:right-6 lg:bottom-6 lg:left-auto"
    >
      {open && (
        <section
          aria-label="Your interests"
          className="pointer-events-auto max-h-[min(34rem,calc(100dvh-8rem))] w-full max-w-md overflow-y-auto rounded-card border border-line bg-surface-raised p-4 shadow-overlay starting:translate-y-2 starting:opacity-0 transition duration-200 ease-out-quint motion-reduce:transition-none"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">What are you into?</h2>
              <p className="text-sm text-ink-muted">Pick as many as you like. Numbers show what's still to come.</p>
            </div>
            <IconButton label="Close" size="sm" icon={<X className="size-4" aria-hidden />} onClick={() => setOpen(false)} />
          </div>
          <TopicChips tree={tree} />
        </section>
      )}
      <div className="pointer-events-auto flex items-center gap-1 rounded-chip border border-line bg-surface-raised p-1 shadow-overlay">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-9 items-center gap-1.5 rounded-chip px-3 text-sm font-medium text-ink hover:bg-surface-sunken"
        >
          {chosen.length ? (
            <>
              <span className="flex -space-x-1" aria-hidden>
                {chosen.slice(0, 4).map((n) => {
                  const Icon = topicIcon(n.icon);
                  return (
                    <span key={n.key} className="grid size-6 place-items-center rounded-full border-2 border-surface-raised bg-accent-soft text-accent-ink">
                      <Icon className="size-3.5" />
                    </span>
                  );
                })}
              </span>
              <span className="sr-only">Your interests: {chosen.map((n) => n.name).join(", ")}</span>
              {chosen.length > 4 && <span className="text-xs text-ink-muted">+{chosen.length - 4}</span>}
            </>
          ) : (
            <>
              <Heart className="size-4 text-accent-ink" aria-hidden /> What are you into?
            </>
          )}
        </button>
        {chosen.length > 0 && (
          <a href="#/foryou" className="for-you-on flex h-9 items-center gap-1 rounded-chip px-3 text-sm font-semibold">
            For you <ArrowRight className="size-4" aria-hidden />
          </a>
        )}
      </div>
    </div>,
    document.body,
  );
}
