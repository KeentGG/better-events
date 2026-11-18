import { ArrowRight, Check, ChevronDown, MapPin, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HeroBurst, HeroSplash } from "../craft/HeroArt";
import { demoNow } from "../lib/demoBoot";
import { phaseOf } from "../lib/eventPhase";
import { href, type Route } from "../lib/route";
import type { AroundPlace, FeedItem, ScheduleEvent, TrafficArea, WeatherNow } from "../lib/types";
import { zoneFirst, zones, useZone } from "../lib/zones";
import { Badge, cn, IconButton } from "../ui";
import { ThemeToggle, useAnchored, WeatherPill } from "./HeaderControls";
import { Kbd, modKey } from "./Kbd";
import { Timeline } from "./Timeline";

/** "Sat, Oct 17, 9 PM" in Bacolod, the day and time a demo is pinned to. */
function demoStamp(iso: string) {
  const parts = new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const minute = part("minute");
  return `${part("weekday")}, ${part("month")} ${part("day")}, ${minute === "00" ? part("hour") : `${part("hour")}:${minute}`} ${part("dayPeriod")}`;
}

/** The site menu, as pills. One pill per page; a page's own filters (Around's kinds) live on the page. */
export const menu: Array<{ label: string; route: Route }> = [
  { label: "Now", route: { tab: "now" } },
  { label: "Schedule", route: { tab: "schedule" } },
  { label: "Traffic", route: { tab: "traffic" } },
  { label: "Around", route: { tab: "around" } },
  { label: "Visit", route: { tab: "visit" } },
  { label: "For you", route: { tab: "foryou" } },
  { label: "Contribute", route: { tab: "report" } },
];

function MenuPills({ at, go }: { at: Route; go: (r: Route) => void }) {
  const list = useRef<HTMLUListElement>(null);
  // On a phone the row scrolls, so the page you're on is brought into view.
  useEffect(() => {
    list.current?.querySelector("[aria-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [at.tab]);
  return (
    <nav aria-label="Main" className="hero-pills min-w-0">
      <ul ref={list} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {menu.map(({ label, route }) => {
          const on = route.tab === at.tab;
          return (
            <li key={label} className="shrink-0">
              <a
                href={href(route)}
                onClick={(e) => (e.preventDefault(), go(route))}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-chip border px-3.5 text-sm font-medium transition duration-150 ease-out-quint active:scale-[0.97]",
                  on ? "border-transparent bg-surface-inverse text-ink-inverse" : "border-line bg-surface-raised/75 text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** "Where are you?": a searchable list of festival zones. No zone means all of Bacolod. */
function AreaPicker({ compact }: { compact?: boolean }) {
  const [zone, setZone] = useZone();
  const { at, open, toggle, close, button, panel } = useAnchored<HTMLButtonElement>(304);
  const [q, setQ] = useState("");

  const shown = zones.filter((z) => `${z.name} ${z.hint}`.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (id: string | null) => (setZone(id), close(), setQ(""));
  const option = (id: string | null, name: string, hint: string) => (
    <li key={id ?? "all"}>
      <button
        type="button"
        role="option"
        aria-selected={(zone?.id ?? null) === id}
        onClick={() => pick(id)}
        className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left hover:bg-surface-sunken"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{name}</span>
          <span className="block truncate text-xs text-ink-muted">{hint}</span>
        </span>
        {(zone?.id ?? null) === id && <Check className="size-4 text-primary-ink" aria-hidden />}
      </button>
    </li>
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-chip border border-line-strong bg-surface-raised px-3 text-sm shadow-card transition hover:border-ink-subtle"
      >
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        {!compact && <span className="text-ink-muted">Where are you?</span>}
        <span className="truncate font-semibold">{zone?.name ?? "All of Bacolod"}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-muted transition", open && "rotate-180")} aria-hidden />
      </button>
      {at &&
        createPortal(
          <div ref={panel} style={at} className="fixed z-50 w-[min(19rem,calc(100vw-2rem))] rounded-card border border-line bg-surface-raised p-2 text-ink shadow-overlay">
            <input
              // Not on a phone: the keyboard would cover the list, and most people just tap an area.
              autoFocus={window.matchMedia("(pointer: fine)").matches}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && shown[0] && pick(shown[0].id)}
              placeholder="Lacson, plaza, lagoon…"
              aria-label="Find an area"
              className="mb-1 h-10 w-full rounded-control border border-line bg-surface px-3 text-sm outline-none focus:border-ink-subtle"
            />
            <ul role="listbox" aria-label="Areas" className="max-h-72 overflow-y-auto">
              {!q && option(null, "All of Bacolod", "Everything, wherever it is")}
              {shown.map((z) => option(z.id, z.name, z.hint))}
              {shown.length === 0 && <li className="px-2.5 py-3 text-sm text-ink-muted">No area by that name yet.</li>}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}

/** A way of asking, and things to ask it about. The field types them out in turn. */
interface Prompt {
  lead: string;
  words: string[];
}

/** Shown until the data is in, and for any prompt the data has nothing for. */
const fallback: Prompt[] = [
  { lead: "Search", words: ["chess tournament", "chicken inasal", "street dance", "Lacson closures"] },
  { lead: "Show me around", words: zones.map((z) => z.name) },
  { lead: "What time is", words: ["the street dance", "Electric MassKara", "the fireworks"] },
  { lead: "Where can I find", words: ["chicken inasal", "piaya", "food stalls"] },
];

/** A title cut to its name: "MasskaHazed: HAZED 1st anniversary at D'Cloud" is "MasskaHazed". Null when what's left is too long to type out. */
function shortName(title: string) {
  const name = title.split(/:| \(| — | ft\. | at | with |, /)[0].trim();
  return name.length >= 3 && name.length <= 30 ? name : null;
}

function shuffled<T>(list: T[]) {
  const out = [...new Set(list)];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The search field's prompts, filled from what the app holds right now so every example is something
 * search will find: events still to come, the places on Around, the zones and the roads with reports.
 */
function usePrompts(schedule: ScheduleEvent[] | undefined, around: AroundPlace[] | undefined, traffic: TrafficArea[] | undefined): Prompt[] {
  return useMemo(() => {
    const events = (schedule ?? []).filter((e) => phaseOf(e) !== "done" && phaseOf(e) !== "cancelled").flatMap((e) => shortName(e.title) ?? []).filter((w, i, all) => all.indexOf(w) === i);
    const venues = (around ?? []).filter((p) => p.kind.key === "venue").map((p) => p.title);
    const areas = [...zones.map((z) => z.name), ...venues, ...(traffic ?? []).map((t) => t.area)];
    const spots = (around ?? []).filter((p) => p.kind.key !== "venue");
    const finds = [...spots.map((p) => p.title), ...spots.map((p) => p.kind.plural.toLowerCase())];
    const lists = [[...events, ...areas, ...finds], areas, events, finds];
    return fallback.map((f, i) => ({ lead: f.lead, words: lists[i].length >= 3 ? shuffled(lists[i]) : f.words }));
  }, [schedule, around, traffic]);
}

/**
 * Types a prompt's example out, holds it, clears it, then moves to the next prompt; each prompt works
 * through its own examples a round at a time. Holds still on the first for reduced motion.
 */
function useTyped(prompts: Prompt[]) {
  const latest = useRef(prompts);
  latest.current = prompts;
  const [shown, setShown] = useState({ lead: prompts[0].lead, text: prompts[0].words[0] });
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pick = (turn: number) => {
      const all = latest.current;
      const p = all[turn % all.length];
      return { lead: p.lead, word: p.words[Math.floor(turn / all.length) % p.words.length] };
    };
    let turn = 0;
    let { lead, word } = pick(0);
    let len = word.length;
    let erasing = true;
    let timer = 0;
    const step = () => {
      if (erasing && len === 0) {
        ({ lead, word } = pick(++turn));
        erasing = false;
      } else if (!erasing && len === word.length) erasing = true;
      else len += erasing ? -1 : 1;
      setShown({ lead, text: word.slice(0, len) });
      timer = window.setTimeout(step, len === word.length ? 2200 : erasing ? 28 : 70);
    };
    timer = window.setTimeout(step, 2200);
    return () => clearTimeout(timer);
  }, []);
  return shown;
}

/** The hero's search: drawn as the text field it stands for, typing out things people look for. It opens the search palette. */
function SearchField({ onSearch, prompts }: { onSearch: () => void; prompts: Prompt[] }) {
  const { lead, text } = useTyped(prompts);
  return (
    <button
      type="button"
      onClick={onSearch}
      aria-label="Search events, roads and places"
      className="mt-4 flex h-12 w-full max-w-[34rem] cursor-text items-center gap-2.5 rounded-chip border border-line-strong bg-surface-raised pr-2 pl-4 text-left shadow-card transition hover:border-ink-subtle hover:shadow-raised"
    >
      <Search className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-ink-subtle" aria-hidden>
        {lead} <span className="text-ink">{text}</span>
        <span className="hero-caret" />
      </span>
      <span className="hidden shrink-0 gap-1 [@media(pointer:fine)]:flex" aria-hidden>
        <Kbd>{modKey}</Kbd>
        <Kbd>K</Kbd>
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-inverse text-ink-inverse [@media(pointer:fine)]:hidden" aria-hidden>
        <ArrowRight className="size-4" />
      </span>
    </button>
  );
}

/** What's still to come today, the chosen zone first. */
function useToday(schedule: ScheduleEvent[] | undefined) {
  const [zone] = useZone();
  return useMemo(() => {
    const endOfDay = new Date().setHours(24, 0, 0, 0);
    const all = [...(schedule ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).filter((e) => Date.parse(e.startsAt) < endOfDay && phaseOf(e) !== "done");
    return zoneFirst(all, zone, (e) => [e.venue]);
  }, [schedule, zone]);
}

/**
 * Today's events down the side of the open header, as many as its height holds; the rest fold into the
 * "+N" knot. It takes its height from the header and never adds to it.
 */
function TodayRail({ events, go }: { events: ScheduleEvent[]; go: (r: Route) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(1);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const gap = 10;
    const fit = () => {
      const live = el.querySelector<HTMLElement>("[data-live]");
      const row = el.querySelector<HTMLElement>("[data-row]");
      if (!el.clientHeight || !row) return;
      const rest = events.length - (live ? 1 : 0);
      const room = el.clientHeight - (live ? live.offsetHeight + gap : 0);
      const rows = (h: number) => Math.floor((h + gap) / (row.offsetHeight + gap));
      // When some stay hidden, the "+N" knot under the last row needs its own room.
      setLimit(Math.max(1, rows(room) >= rest ? rest : rows(room - 34)));
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [events]);

  return (
    <div className="hero-rail">
      <div ref={box} className="absolute inset-0 overflow-y-clip">
        <Timeline events={events} limit={limit} onMore={() => go({ tab: "schedule" })} brief />
      </div>
    </div>
  );
}

interface HeaderProps {
  at: Route;
  go: (r: Route) => void;
  onSearch: () => void;
  weather: WeatherNow | undefined;
  warning: FeedItem | undefined;
  schedule: ScheduleEvent[] | undefined;
  /** Places and roads, for the search field's examples. */
  around: AroundPlace[] | undefined;
  traffic: TrafficArea[] | undefined;
  /** True while the API is unreachable and pages show bundled sample data. */
  sample: boolean;
  /** The full hero (Now), which compacts as the page scrolls. Other pages get the compact header only. */
  full: boolean;
}

/**
 * Keeps the full header's height in step with the scroll: it starts at its natural height and gives up
 * one pixel for every pixel scrolled until it reaches the compact height (--hc), while a spacer below
 * takes up the difference so the page under it never jumps. The header is a size container, so its
 * layout follows the height it has (src/index.css, "Site header"). --p (0 open to 1 compact) shrinks the
 * prompt and fades the art; --fade (1 to 0 over the last 8rem) fades the middle out just before it goes.
 */
function useCompacting(full: boolean, ...content: unknown[]) {
  const head = useRef<HTMLElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const middle = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = head.current;
    if (!full || !el) return;
    let natural = 0;
    let capped = false;
    let compact = 0;
    let frame = 0;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

    const update = () => {
      frame = 0;
      const h = Math.max(compact, natural - window.scrollY);
      el.style.height = `${h}px`;
      if (spacer.current) spacer.current.style.height = `${natural - h}px`;
      el.style.setProperty("--p", natural > compact ? ((natural - h) / (natural - compact)).toFixed(3) : "1");
      // The middle fades over the last 8rem before compact, however tall the header started.
      el.style.setProperty("--fade", Math.min(1, Math.max(0, (h - compact) / (8 * rem))).toFixed(3));
      // Whenever the middle is cut short, its bottom edge fades instead of cutting a card in half.
      el.toggleAttribute("data-clipped", capped || h < natural);
    };
    // Opens the header fully for a moment (same frame, never painted) to read its natural height.
    const measure = () => {
      el.style.setProperty("--p", "0");
      el.style.setProperty("--fade", "1");
      el.style.height = "9999px";
      // Three rows: brand and controls side by side, the middle's content, the pills. Demo mode adds its notice.
      const part = (sel: string) => el.querySelector<HTMLElement>(sel)?.offsetHeight ?? 0;
      const grid = el.querySelector<HTMLElement>(".hero-grid");
      const s = grid ? getComputedStyle(grid) : null;
      const demo = el.hasAttribute("data-demo");
      const rows = Math.max(part(".hero-brand"), part(".hero-controls")) + part(".hero-middle-inner") + part(".hero-pills") + (demo ? part(".hero-demo") : 0);
      natural = Math.ceil(rows + (s ? (demo ? 3 : 2) * parseFloat(s.rowGap) + parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) : 0));
      // Never taller than --hmax, so the feed always starts within reach; the middle clips past it.
      const cap = parseFloat(getComputedStyle(el).getPropertyValue("--hmax")) * rem;
      capped = !!cap && natural > cap;
      if (capped) natural = cap;
      compact = parseFloat(getComputedStyle(el).minHeight) || 0;
      update();
    };
    const onScroll = () => (frame ||= requestAnimationFrame(update));

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      el.style.height = "";
      el.style.removeProperty("--p");
      el.style.removeProperty("--fade");
      el.removeAttribute("data-clipped");
    };
    // `content` only triggers a fresh measurement.
  }, [full, ...content]);

  return { head, spacer, middle };
}

/**
 * The site header, one element on every public page. On Now it opens as the full hero (where you are, a
 * search field, today's events and the menu, over the festival art) and compacts as the page scrolls into
 * a bar with the area, search and menu. Other pages show that bar.
 */
export function SiteHeader({ at, go, onSearch, weather, warning, schedule, around, traffic, sample, full }: HeaderProps) {
  // Measured again when what's on, the zone or the weather changes, since each changes the open height.
  const [zone] = useZone();
  const today = useToday(schedule);
  const prompts = usePrompts(schedule, around, traffic);
  const { head, spacer, middle } = useCompacting(full, schedule, zone, weather, sample);

  return (
    <>
      <header ref={head} data-demo={demoNow ? "" : undefined} data-rail={full && today.length ? "" : undefined} className={cn("hero-head border-b border-line", full ? "is-full" : "is-compact")}>
        {/* The art is clipped to the header and fades as it compacts. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="hero-mesh absolute inset-0" />
          {full && (
            <>
              <HeroSplash className="hero-art absolute bottom-0 left-0 w-36 @min-[40rem]/app:w-52" />
              <HeroBurst className="hero-art absolute -right-20 bottom-0 w-[min(38rem,115%)]" />
            </>
          )}
        </div>

        <div className="hero-grid page-gutter mx-auto max-w-[96rem]">
          {demoNow && (
            <p className="hero-demo min-w-0">
              <Badge tone="neutral" className="max-w-full">
                {`Demo: the site as it was on ${demoStamp(demoNow)}`}
              </Badge>
            </p>
          )}

          <div className="hero-brand flex min-w-0 items-center gap-2">
            <a href="#/now" className="hero-brand-name shrink-0 font-display text-[1.375rem] leading-none font-semibold tracking-tight" aria-label="Better Maskara, home">
              <span className="brand-long">Better Maskara</span>
              <span className="brand-short">BM</span>
              <span className="text-primary">.</span>
            </a>
            <span className="hero-compact-only min-w-0 items-center gap-1">
              <AreaPicker compact />
              <IconButton label="Search" icon={<Search className="size-5" aria-hidden />} onClick={onSearch} variant="ghost" size="sm" />
            </span>
          </div>

          {weather && (
            <div className="hero-weather header-extra">
              <WeatherPill weather={weather} warning={warning} />
            </div>
          )}

          <div className="hero-controls flex min-w-0 items-center gap-1.5">
            {/* Heads the rail of today's events when it runs down the side. */}
            <a href={href({ tab: "schedule" })} className="hero-rail-title mr-auto items-center gap-1 truncate font-mono text-[0.6875rem] tracking-[0.14em] text-ink-muted uppercase hover:text-ink">
              Today · {new Date().toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila" })}
              <ArrowRight className="size-3.5" aria-hidden />
            </a>
            {sample && (
              <span className="header-extra ml-auto" title="The API is unreachable, so pages show sample data.">
                <Badge tone="warn">Sample data</Badge>
              </span>
            )}
            <ThemeToggle />
          </div>

          {full && (
            <div ref={middle} className="hero-middle">
              <div className="hero-middle-inner">
                <div className="min-w-0">
                  <AreaPicker />
                  <h1 className="hero-prompt mt-4 max-w-[16ch] font-display text-balance">
                    What are you <em className="text-primary-ink">interested in?</em>
                  </h1>
                  <SearchField onSearch={onSearch} prompts={prompts} />
                </div>
                {today.length > 0 && (
                  <div className="hero-today-inline">
                    <Timeline events={today} limit={1} onMore={() => go({ tab: "schedule" })} brief />
                  </div>
                )}
              </div>
            </div>
          )}

          {full && today.length > 0 && <TodayRail events={today} go={go} />}

          <MenuPills at={at} go={go} />
        </div>
      </header>
      {full && <div ref={spacer} aria-hidden className="[overflow-anchor:none]" />}
    </>
  );
}
