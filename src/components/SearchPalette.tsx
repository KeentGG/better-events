import { dailyUntil, onePerSeries } from "../lib/occurrences";
import { CalendarDays, Car, Compass, CornerDownLeft, MapPin, Newspaper, Search, Store, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { shortcuts } from "../lib/intents";
import { href, type Route } from "../lib/route";
import { eventTime } from "../lib/time";
import type { AroundPlace, FeedItem, ScheduleEvent, TrafficArea, VisitSection } from "../lib/types";
import { matchTopic, topicIndex, usePreferences, useTopicTree } from "../lib/interests";
import { cn, forYouClass, PreferredBadge } from "../ui";
import { Kbd } from "./Kbd";

interface Result {
  id: string;
  group: string;
  title: string;
  meta: string;
  icon: LucideIcon;
  route: Route;
  text: string;
  topics?: string[];
}

function index(d: SearchData): Result[] {
  const r: Result[] = [];
  const go = Object.values(shortcuts)
    .flat()
    .flatMap((s) => ("route" in s.action ? [{ ...s, route: s.action.route }] : []));
  for (const s of go) r.push({ id: `go-${s.id}`, group: "Go to", title: s.label, meta: s.hint, icon: s.icon, route: s.route, text: `${s.label} ${s.hint}` });
  for (const e of onePerSeries(d.schedule ?? [], Date.now()))
    r.push({ id: e.id, group: "Events", title: e.title, meta: `${e.series ? `${dailyUntil(e.series)} · ` : ""}${eventTime(e)} · ${e.venue}`, icon: CalendarDays, route: { tab: "schedule", detail: e.id }, text: `${e.title} ${e.venue} ${(e.venues ?? []).map((v) => v.venue).join(" ")} ${e.kind}`, topics: e.topics });
  for (const a of d.traffic ?? [])
    r.push({ id: `t-${a.area}`, group: "Roads", title: a.area, meta: `Traffic ${a.level}`, icon: Car, route: { tab: "traffic", detail: encodeURIComponent(a.area) }, text: `${a.area} traffic ${a.level}` });
  for (const p of d.around ?? []) r.push({ id: p.id, group: "Around", title: p.title, meta: p.place, icon: Store, route: { tab: "around", detail: p.kind.key }, text: `${p.title} ${p.place} ${p.kind.name} ${p.kind.plural}`, topics: p.topics });
  for (const s of d.visit ?? [])
    for (const it of s.items) r.push({ id: `${s.id}-${it.title}`, group: "Visitor guide", title: it.title, meta: s.title, icon: Compass, route: { tab: "visit", detail: s.id }, text: `${it.title} ${it.body}` });
  for (const f of d.feed ?? [])
    r.push({ id: f.id, group: "Updates", title: f.title, meta: f.area ?? f.source.name, icon: f.area ? MapPin : Newspaper, route: { tab: "now" }, text: `${f.title} ${f.body} ${f.area ?? ""}`, topics: f.topics });
  return r;
}

export interface SearchData {
  schedule?: ScheduleEvent[];
  feed?: FeedItem[];
  traffic?: TrafficArea[];
  around?: AroundPlace[];
  visit?: VisitSection[];
}

/**
 * One box for everything: events, roads, places, the visitor guide and page shortcuts.
 * Opens with ⌘K, Ctrl+K or "/" on a keyboard, or the search button on a phone. Arrow keys move, Enter opens.
 */
export function SearchPalette({ open, onClose, data }: { open: boolean; onClose: () => void; data: SearchData }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const { topics: prefs } = usePreferences();
  const tree = useTopicTree();
  const topicNames = useMemo(() => topicIndex(tree), [tree]);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setQ("");
      setCursor(0);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  const all = useMemo(() => index(data), [data]);
  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    // With no query, suggest the page shortcuts and today's events.
    if (words.length === 0) return all.filter((r) => r.group === "Go to" || r.group === "Events").slice(0, 8);
    return all.filter((r) => words.every((w) => r.text.toLowerCase().includes(w))).slice(0, 12);
  }, [all, q]);

  const pick = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    location.hash = href(r.route);
  };

  let lastGroup = "";
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-label="Search"
      className="palette bg-surface-raised p-0 text-ink backdrop:bg-neutral-950/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-5 shrink-0 text-ink-muted" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setCursor((c) => Math.min(c + 1, results.length - 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setCursor((c) => Math.max(c - 1, 0)));
              else if (e.key === "Enter") (e.preventDefault(), pick(results[cursor]));
            }}
            placeholder="Search events, roads, places…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={results[cursor] ? `sr-${results[cursor].id}` : undefined}
            className="h-15 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-subtle"
          />
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-control text-ink-muted hover:bg-surface-sunken" aria-label="Close search">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <ul id="search-results" role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-muted">No matches for “{q}”.</li>}
          {results.map((r, i) => {
            const hit = matchTopic(prefs, r.topics);
            const forYou = hit ? (topicNames.get(hit)?.name ?? hit) : null;
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <li key={r.id} role="presentation">
                {header && <p className="px-3 pt-3 pb-1 font-mono text-[0.6875rem] tracking-[0.14em] text-ink-subtle uppercase">{header}</p>}
                <button
                  id={`sr-${r.id}`}
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  onMouseMove={() => setCursor(i)}
                  onClick={() => pick(r)}
                  className={cn("flex min-h-12 w-full items-center gap-3 rounded-control px-3 py-2 text-left", i === cursor && "bg-surface-sunken", forYouClass(forYou))}
                >
                  <r.icon className="size-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-ink-muted">{r.meta}</span>
                  </span>
                  <PreferredBadge topic={forYou} />
                  {i === cursor && <CornerDownLeft className="size-4 shrink-0 text-ink-subtle" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="hidden items-center gap-3 border-t border-line px-4 py-2.5 text-xs text-ink-subtle [@media(pointer:fine)]:flex">
          <span className="inline-flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Enter</Kbd> open
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd>Esc</Kbd> close
          </span>
        </p>
      </div>
    </dialog>
  );
}

/** ⌘K, Ctrl+K, or "/" when not typing, opens search. */
export function useSearchHotkey(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}
