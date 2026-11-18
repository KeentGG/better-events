import { dailyUntil } from "../lib/occurrences";
import { BadgeCheck, ChevronDown, Clock, ExternalLink, MapPin } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { WeatherScene } from "../craft/WeatherScene";
import { topRows } from "../lib/results";
import { categoryMeta, eventKindMeta } from "../lib/categories";
import { forecastFor, type WeatherSlot } from "../lib/eventWeather";
import { skyLook } from "../lib/sky";
import { type EventPhase, hasResults, phaseOf, railOrder } from "../lib/eventPhase";
import { clock, eventTime, formerWhen } from "../lib/time";
import { href } from "../lib/route";
import { VENUE_ROLE_LABEL, presenterLine, type ScheduleEvent, type WeatherNow } from "../lib/types";
import { ResultsList, StageTag } from "./ResultsList";
import { dayTime } from "../lib/time";
import { DayForecast, WeatherChip, WeatherStrip } from "./EventWeather";
import { Badge, cn, forYouClass, LiveDot, PreferredBadge, usePreferredTopic } from "../ui";

export { phaseOf, type EventPhase };

/**
 * The event happening now, drawn as a deep mulberry card with a woven wedge where a photo would go.
 * Only one per screen: it is the loudest thing on the page on purpose.
 */
export function NowCard({ event, weather }: { event: ScheduleEvent; weather?: WeatherNow }) {
  const Icon = eventKindMeta[event.kind].icon;
  const forecast = forecastFor(event, weather);
  const sky = forecast?.mode === "ambient" ? forecast.slot : null;
  return (
    <article className={cn("relative isolate overflow-hidden rounded-card bg-[linear-gradient(120deg,var(--color-brand-800),var(--color-brand-950))] text-white shadow-raised", sky && "on-sky")}>
      {sky ? (
        <>
          {/* The sky outside right now, with the mulberry kept under the copy so it still reads as the live card, and the woven sash over the weather. */}
          <WeatherScene scene={sky.scene} isDay={sky.isDay} cloudCover={sky.cloudCover} rainMm={sky.precipitationMm} at={sky.at} className="absolute inset-0 -z-10 size-full" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,color-mix(in_oklch,var(--color-brand-950)_88%,transparent),color-mix(in_oklch,var(--color-brand-900)_60%,transparent)_55%,transparent)]" />
          <div aria-hidden className="weave weave-sash-soft absolute inset-0 -z-10 bg-white/6 [--color-weave-thread:color-mix(in_oklch,var(--color-gold-300)_45%,transparent)]" />
          <div aria-hidden className="weave weave-sash absolute inset-0 -z-10 bg-white/6 [--color-weave-thread:color-mix(in_oklch,var(--color-gold-300)_45%,transparent)]" />
        </>
      ) : (
        <>
          {/* A woven sash leaning across the right: sharp in its middle, blurring out to nothing on both edges, and clear of the icon's corner. */}
          <div aria-hidden className="weave weave-sash-soft absolute inset-0 bg-white/6 [--color-weave-thread:color-mix(in_oklch,var(--color-gold-300)_45%,transparent)]" />
          <div aria-hidden className="weave weave-sash absolute inset-0 bg-white/6 [--color-weave-thread:color-mix(in_oklch,var(--color-gold-300)_45%,transparent)]" />
          <Icon aria-hidden className="absolute right-4 bottom-3 size-14 text-gold-200/35" strokeWidth={1.25} />
        </>
      )}
      <div className={cn("relative space-y-2 p-4", forecast?.mode === "timeline" ? "pr-4" : "pr-[34%]")}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
          <span className="inline-flex items-center gap-1.5 font-semibold text-gold-200">
            <LiveDot tone="ok" /> Happening now
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden /> {event.venue}
          </span>
        </p>
        <h3 className="font-display text-2xl leading-tight font-semibold text-balance">{event.title}</h3>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/75">
          <FormerTime event={event} />
          {liveUntil(event)}
          {event.official && (
            <span className="inline-flex items-center gap-1 font-medium text-white/90">
              <BadgeCheck className="size-3.5" aria-hidden /> Official
            </span>
          )}
        </p>
        {event.note && <p className="text-sm text-white/80">{event.note}</p>}
        {sky && <WeatherChip slot={sky} live />}
        {forecast?.mode === "timeline" && (
          <div className="on-sky [text-shadow:none]">
            <WeatherStrip slots={forecast.slots} />
          </div>
        )}
      </div>
    </article>
  );
}

/** The first start, struck through, when a change has moved the event off it. */
function FormerTime({ event }: { event: ScheduleEvent }) {
  const former = formerWhen(event);
  if (!former) return null;
  return (
    <>
      <span className="sr-only">was </span>
      <s>{former}</s>{" "}
    </>
  );
}

function StatusBadge({ event, phase }: { event: ScheduleEvent; phase: EventPhase }) {
  if (phase === "cancelled") return <Badge tone="danger">Cancelled</Badge>;
  if (event.results) return <Badge tone={event.results.stage === "standings" ? "neutral" : "ok"}>{event.results.stage === "standings" ? "Standings" : "Results"}</Badge>;
  if (phase === "done") return <Badge tone="neutral">Done</Badge>;
  // Once it's on, that's what matters, even if it was late getting there.
  if (phase === "live") return <Badge tone="ok">Now</Badge>;
  if (event.status === "delayed") return <Badge tone="warn">Delayed</Badge>;
  if (event.status === "tba") return <Badge tone="warn">Time to follow</Badge>;
  const Icon = eventKindMeta[event.kind].icon;
  return (
    <Badge topic tone="neutral" icon={<Icon aria-hidden />}>
      {eventKindMeta[event.kind].label}
    </Badge>
  );
}

/** Byline, note and description share two lines, separated by " · ". "Read more..." only appears when that clamp hides text. */
function EventCopy({ presenter, note, noteClass, description }: { presenter: string | null; note: string | null; noteClass: string; description?: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      if (open) return;
      setClamped(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [presenter, note, description, open]);

  if (!presenter && !note && !description) return null;

  return (
    <div>
      <p ref={ref} className={cn("text-sm leading-relaxed", !open && "line-clamp-2")}>
        {presenter && <span className="font-medium text-ink-muted">{presenter}{note || description ? " · " : ""}</span>}
        {note && <span className={noteClass}>{note}{description ? " · " : ""}</span>}
        {description && <span className="whitespace-pre-line text-ink-muted">{description}</span>}
      </p>
      {(clamped || open) && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="-my-1.5 py-1.5 text-sm font-medium text-ink underline-offset-2 hover:underline">
          {open ? "Show less" : "Read more..."}
        </button>
      )}
    </div>
  );
}

/** The top three places under the title, with the rest behind a disclosure; a placeholder says when results are due. */
function EventResults({ event }: { event: ScheduleEvent }) {
  const [all, setAll] = useState(false);
  const r = event.results;
  if (!r) return event.resultsExpectedAt ? <p className="text-sm font-medium text-warn-ink">Results expected {dayTime(event.resultsExpectedAt)}</p> : null;
  const { shown, more } = topRows(r.rows);
  return (
    <div className="space-y-1.5 py-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StageTag stage={r.stage} />
        {event.resultsExpectedAt && <span className="text-xs font-medium text-warn-ink">Update expected {dayTime(event.resultsExpectedAt)}</span>}
      </div>
      <ResultsList rows={all ? r.rows : shown} />
      {more > 0 && (
        <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className="-my-1.5 py-1.5 text-sm font-medium text-primary-ink underline-offset-2 hover:underline">
          {all ? "Show fewer" : `Show all ${r.rows.length} results`}
        </button>
      )}
    </div>
  );
}

export function EventRow({ event, phase, weather }: { event: ScheduleEvent; phase: EventPhase; weather?: WeatherNow }) {
  // An event with results is what people come back for, so it stays bright.
  const quiet = (phase === "done" && !hasResults(event)) || phase === "cancelled";
  const forYou = usePreferredTopic(event.topics);
  // With only a start, the card wears the sky at that hour; with an end too, it gets an hourly strip; with only a date, a line.
  const forecast = forecastFor(event, weather);
  const sky = forecast?.mode === "ambient" ? forecast.slot : null;
  // From 5 PM the whole card turns into the sky (a light sunset, then twilight and night with light text); before that it sits beside it.
  const look = sky ? skyLook({ scene: sky.scene, isDay: sky.isDay, cloudCover: sky.cloudCover, rainMm: sky.precipitationMm, at: sky.at }) : null;
  const dusk = look && look.hour !== "day";
  return (
    <li id={`event-${event.id}`} className="relative scroll-mt-24">
      {/* Woven knot on the rail; filled gold while the event is live */}
      <span
        aria-hidden
        className={cn(
          "absolute top-5 -left-[1.4rem] size-2.5 rotate-45 rounded-[2px] border-2",
          phase === "live" ? "border-accent bg-accent" : "border-weave bg-surface",
        )}
      />
      <div
        className={cn(
          // A festival day is dozens of cards, each with a sky and its blurs; off screen they are skipped, which keeps a phone scrolling.
          "rounded-card border border-line bg-surface-raised p-3.5 shadow-card [contain-intrinsic-size:auto_11rem] [content-visibility:auto]",
          quiet && "opacity-65",
          forYouClass(forYou),
          forYou && sky && !dusk && "for-you-sky",
          sky && "relative isolate overflow-hidden",
          dusk && "border-transparent",
          dusk && (look.hour === "sunset" ? "on-sunset" : "on-sky"),
        )}
        // Sized to the border box, or the gradient tiles into the 1px transparent border: a sliver of the bottom colour along the top.
        style={dusk ? { background: `linear-gradient(${[look.top, look.mid, look.bottom].filter(Boolean).join(", ")}) border-box` } : undefined}
      >
        {sky && <SkyWedge slot={sky} wide={!!dusk} />}
        {/* A wash under the copy: light on a sunset, which keeps dark text, and dark under twilight and night's light text. */}
        {dusk && (
          <div
            aria-hidden
            className={cn(
              "absolute inset-0 -z-10",
              look.hour === "sunset"
                ? "bg-[linear-gradient(100deg,rgb(255_250_245/0.3),rgb(255_250_245/0.08)_55%,transparent_80%)]"
                : "bg-[linear-gradient(100deg,rgb(0_0_0/0.35),rgb(0_0_0/0.12)_55%,transparent_80%)]",
            )}
          />
        )}
        <div className="flex items-start gap-3">
          {/* Wraps the copy short of the sky, so it stays on the card's own surface. */}
          <div className={cn("min-w-0 flex-1 space-y-1", sky && !dusk && "pr-[min(6rem,12%)]")}>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-muted">
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Clock className="size-3.5" aria-hidden /> <FormerTime event={event} />
                {/* Waiting on a new time, and nothing earlier to strike: the clock itself is struck out. */}
                {event.status === "tba" && phase === "next" && !formerWhen(event) ? <s>{eventTime(event)}</s> : eventTime(event)}
              </span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{event.venue}</span>
              </span>
              {event.series && <span>{dailyUntil(event.series)}</span>}
            </p>
            {!!event.venues?.length && (
              <p className="flex flex-wrap gap-x-2 text-xs text-ink-subtle" aria-label="Other venues">
                {event.venues.map((v, i) => (
                  <span key={i}>
                    {i > 0 && <span aria-hidden>· </span>}
                    {VENUE_ROLE_LABEL[v.role]}:{" "}
                    {v.area ? (
                      <a className="underline-offset-2 hover:text-primary-ink hover:underline" href={href({ tab: "traffic", detail: encodeURIComponent(v.area) })}>
                        {v.venue}
                      </a>
                    ) : (
                      v.venue
                    )}
                  </span>
                ))}
              </p>
            )}
            <h3 className={cn("text-[1.0625rem] leading-snug font-semibold text-balance", phase === "cancelled" && "line-through decoration-1")}>{event.title}</h3>
            <PreferredBadge topic={forYou} />
            <EventCopy
              presenter={presenterLine(event)}
              note={event.note}
              noteClass={event.status === "on_time" || event.status === "done" ? "text-ink-muted" : event.status === "delayed" || event.status === "tba" ? "text-warn-ink" : "text-danger-ink"}
              description={event.description}
            />
            <EventResults event={event} />
            {!!event.notices?.length && (
              <ul className="space-y-0.5 text-xs text-ink-subtle" aria-label="Notices during this event">
                {event.notices.map((n) => (
                  <li key={n.id}>
                    <a className="underline-offset-2 hover:text-primary-ink hover:underline" href={href({ tab: "now" })}>
                      <span className="font-medium">{categoryMeta[n.category].label}:</span> {n.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {sky && <WeatherChip slot={sky} live={phase === "live"} />}
            {forecast?.mode === "day" && <DayForecast slot={forecast.slot} lowC={forecast.lowC} />}
            {event.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 py-1 text-sm font-medium text-primary-ink underline-offset-2 hover:underline"
              >
                <ExternalLink className="size-3.5" aria-hidden /> Tickets / info
              </a>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <StatusBadge event={event} phase={phase} />
            {/* Non-official events are welcome on the schedule, but marked so nobody mistakes them for the festival's own. */}
            {!event.official && <Badge tone="info">Community</Badge>}
          </div>
        </div>
        {forecast?.mode === "timeline" && <WeatherStrip slots={forecast.slots} />}
      </div>
    </li>
  );
}

/** Fades the sky out on a slant, blurring as it goes. Each layer blurs harder and reaches less far right. */
// Clear at the bottom-left corner too (the slant puts it ~20% along), opaque from about where the badges start.
const skyFade = "linear-gradient(105deg, transparent 32%, black 58%)";
const blurBands = [
  { blur: 2, until: 70 },
  { blur: 5, until: 60 },
  { blur: 12, until: 50 },
];
/** On a dusk or night card the card is the same sky, so only the clouds and rain fade, and they can reach further. */
const wideFade = "linear-gradient(105deg, transparent 10%, black 55%)";

/**
 * The sky at the event's hour, kept to the right of the card so the copy stays on the card's own surface.
 * It starts about where the badges do and fades left on a slant, softening into a blur as it goes.
 */
function SkyWedge({ slot, wide }: { slot: WeatherSlot; wide: boolean }) {
  const fade = wide ? wideFade : skyFade;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 -z-10", wide ? "w-full" : "w-[min(20rem,62%)]")} style={{ maskImage: fade, WebkitMaskImage: fade }}>
      <WeatherScene scene={slot.scene} isDay={slot.isDay} cloudCover={slot.cloudCover} rainMm={slot.precipitationMm} at={slot.at} className="absolute inset-0 size-full" />
      {blurBands.map(({ blur, until }) => {
        const band = `linear-gradient(105deg, black ${until - 24}%, transparent ${until}%)`;
        return <div key={blur} className="absolute inset-0" style={{ backdropFilter: `blur(${blur}px)`, WebkitBackdropFilter: `blur(${blur}px)`, maskImage: band, WebkitMaskImage: band }} />;
      })}
    </div>
  );
}

/** What a brief card says for the end of a live event: "Until 8:00 PM", "All day" or "Since 6:00 PM". */
function liveUntil(event: ScheduleEvent) {
  if (event.allDay && !event.actualStart) return "All day";
  return event.endsAt && event.status !== "tba" ? `Until ${clock(event.endsAt)}` : `Since ${clock(event.actualStart ?? event.startsAt)}`;
}

/** The NowCard cut down for a tight spot: what, where and until when, on a slimmer woven sash. */
function BriefNowCard({ event }: { event: ScheduleEvent }) {
  const Icon = eventKindMeta[event.kind].icon;
  return (
    <a
      data-live
      href={href({ tab: "schedule", detail: event.id })}
      className="relative isolate block overflow-hidden rounded-card bg-[linear-gradient(120deg,var(--color-brand-800),var(--color-brand-950))] text-white shadow-raised transition hover:brightness-110"
    >
      <div aria-hidden className="weave weave-sash-soft weave-sash-brief absolute inset-0 bg-white/6 [--color-weave-thread:color-mix(in_oklch,var(--color-gold-300)_45%,transparent)]" />
      <div aria-hidden className="weave weave-sash weave-sash-brief absolute inset-0 bg-white/6 [--color-weave-thread:color-mix(in_oklch,var(--color-gold-300)_45%,transparent)]" />
      <Icon aria-hidden className="absolute top-1/2 right-3 size-7 -translate-y-1/2 text-gold-200/35" strokeWidth={1.25} />
      <div className="relative py-3 pr-[22%] pl-3.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-gold-200">
          <LiveDot tone="ok" /> Happening now
        </p>
        <h3 className="mt-0.5 truncate font-display text-lg leading-snug font-semibold">{event.title}</h3>
        {/* The venue gives way before the time does. */}
        <p className="flex gap-1 text-sm text-white/75">
          <span className="truncate">{event.venue}</span>
          <span className="shrink-0">· {liveUntil(event)}</span>
        </p>
      </div>
    </a>
  );
}

/** An EventRow cut down to one tight line: start time, title and venue, and the kind as an icon. */
function BriefRow({ event, phase }: { event: ScheduleEvent; phase: EventPhase }) {
  const Icon = eventKindMeta[event.kind].icon;
  const changed = event.status === "delayed" || event.status === "tba";
  const start = event.allDay ? "All day" : event.timeKnown === false || event.status === "tba" ? "Time TBA" : clock(event.startsAt);
  return (
    <li data-row className="relative">
      <span aria-hidden className={cn("absolute top-1/2 -left-[1.4rem] size-2.5 -translate-y-1/2 rotate-45 rounded-[2px] border-2", phase === "live" ? "border-accent bg-accent" : "border-weave bg-surface")} />
      <a
        href={href({ tab: "schedule", detail: event.id })}
        className="flex items-center gap-3 rounded-card border border-line bg-surface-raised px-3 py-2.5 shadow-card transition hover:border-line-strong"
      >
        <span className={cn("w-16 shrink-0 text-sm font-semibold tabular-nums", changed ? "text-warn-ink" : "text-primary-ink")}>{start}</span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[0.9375rem] font-semibold", phase === "cancelled" && "line-through decoration-1")}>{event.title}</span>
          <span className="block truncate text-xs text-ink-muted">
            {event.status === "delayed" ? "Delayed · " : phase === "cancelled" ? "Cancelled · " : ""}
            {event.venue}
          </span>
        </span>
        <Icon className="size-4 shrink-0 text-ink-subtle" aria-label={eventKindMeta[event.kind].label} />
      </a>
    </li>
  );
}

/**
 * A schedule rail: the live event as a NowCard, then the rest hanging off a thin line, with a
 * "+N" knot at the end when more are hidden. `brief` is for tight spots like the home header: the
 * same cards cut down to what, where and when, each linking to the event on the schedule.
 */
export function Timeline({
  events,
  featureLive = true,
  limit,
  onMore,
  brief,
  weather,
  focus,
  earlierOpen = false,
}: {
  events: ScheduleEvent[];
  featureLive?: boolean;
  limit?: number;
  onMore?: () => void;
  brief?: boolean;
  /** The forecast, for weather on full cards. */
  weather?: WeatherNow;
  /** An event linked to (from search): if it's among the finished ones, they start open so it can be found. */
  focus?: string;
  /** Start with finished events shown, as on a day that's already over. */
  earlierOpen?: boolean;
}) {
  // The reader's own choice, once they've made one; a newly linked event clears it so it can be found.
  const [showEarlier, setShowEarlier] = useState<boolean>();
  const [seenFocus, setSeenFocus] = useState(focus);
  if (focus !== seenFocus) {
    setSeenFocus(focus);
    setShowEarlier(undefined);
  }
  const now = Date.now();
  const withPhase = events.map((e) => ({ event: e, phase: phaseOf(e, now) }));
  const live = featureLive ? withPhase.find((e) => e.phase === "live") : undefined;
  // Finished events fold away so the next one is on top; the brief rail never shows them.
  const { earlier, ahead } = railOrder(
    withPhase.filter((e) => e !== live),
    now,
  );
  const earlierWithResults = earlier.filter((e) => hasResults(e.event)).length;
  const openEarlier = !brief && (showEarlier ?? (earlierOpen || earlier.some((e) => e.event.id === focus)));
  const shown = limit === undefined ? ahead : ahead.slice(0, limit);
  const hidden = ahead.length - shown.length;
  const rows = [...(openEarlier ? earlier : []), ...shown];

  return (
    <div>
      {live && (brief ? <BriefNowCard event={live.event} /> : <NowCard event={live.event} weather={weather} />)}
      {(rows.length > 0 || (!brief && earlier.length > 0)) && (
        <ol className={cn("relative ml-4 space-y-2.5 border-l-2 border-weave-soft pl-4", live && "pt-2.5", hidden > 0 && "pb-5")}>
          {!brief && earlier.length > 0 && (
            <li className="relative">
              <span aria-hidden className="absolute top-1/2 -left-[1.4rem] size-2.5 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-weave bg-surface" />
              <button
                type="button"
                aria-expanded={openEarlier}
                onClick={() => setShowEarlier(!openEarlier)}
                className="inline-flex h-8 items-center gap-1.5 rounded-chip border border-line bg-surface-raised px-3 text-sm font-medium text-ink-muted shadow-card hover:text-ink"
              >
                <ChevronDown className={cn("size-4 transition-transform", openEarlier && "rotate-180")} aria-hidden />
                {openEarlier ? "Hide" : "Show"} {earlier.length} earlier {earlier.length === 1 ? "event" : "events"}
                {earlierWithResults > 0 && ` · ${earlierWithResults} with results`}
              </button>
            </li>
          )}
          {rows.map(({ event, phase }) => (
            brief ? <BriefRow key={event.id} event={event} phase={phase} /> : <EventRow key={event.id} event={event} phase={phase} weather={weather} />
          ))}
          {hidden > 0 && (
            <li className="absolute -bottom-3 -left-[0.95rem]">
              <button
                type="button"
                onClick={onMore}
                className="grid h-7 min-w-7 place-items-center rounded-chip border border-line bg-surface-raised px-1.5 text-xs font-semibold text-ink-muted tabular-nums shadow-card hover:text-ink"
                aria-label={`${hidden} more ${hidden === 1 ? "event" : "events"}, open schedule`}
              >
                {hidden}+
              </button>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
