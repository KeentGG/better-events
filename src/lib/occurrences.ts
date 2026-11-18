import { dayStamp, eventTime } from "./time";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** How many days after its first a daily event may run. */
export const MAX_REPEAT_DAYS = 62;

/** What repeating needs of an event: its first day's hours, the last day, and the days called off. */
export interface Series {
  startsAt: string;
  endsAt: string | null;
  allDay?: boolean;
  timeKnown?: boolean;
  repeatUntil?: string | null;
  skipDates?: readonly string[];
}

export interface Occurrence {
  /** The Manila day it starts on, `YYYY-MM-DD`. */
  day: string;
  startsAt: string;
  endsAt: string | null;
}

/** The Manila calendar day a moment falls on, `YYYY-MM-DD`. */
export const manilaDay = (iso: string | number) => new Date((typeof iso === "number" ? iso : Date.parse(iso)) + 8 * HOUR).toISOString().slice(0, 10);

/** Midnight in Manila at the start of a `YYYY-MM-DD` day. */
export const dayStart = (day: string) => Date.parse(`${day}T00:00:00+08:00`);

/** Whole days from one `YYYY-MM-DD` to another (negative when it is before). */
export const daysBetween = (from: string, to: string) => Math.round((dayStart(to) - dayStart(from)) / DAY);

/** The day `n` days after a `YYYY-MM-DD`. */
export const addDays = (day: string, n: number) => manilaDay(dayStart(day) + n * DAY);

export const isRepeating = (e: Pick<Series, "repeatUntil">) => !!e.repeatUntil;

/** Why a last day can't be used with this first day, or null. */
export function repeatProblem(startsAt: string, repeatUntil: string | null | undefined): string | null {
  if (!repeatUntil) return null;
  const n = daysBetween(manilaDay(startsAt), repeatUntil);
  if (n < 1) return "The last day must be after the first day.";
  if (n > MAX_REPEAT_DAYS) return `A daily event can run at most ${MAX_REPEAT_DAYS} days after its first.`;
  return null;
}

/** The moment an occurrence is over: its end, an hour after a timed start with no end, the end of the day when date-only. */
const endOf = (start: number, end: number | null, dateOnly: boolean) => (dateOnly ? start + DAY : (end ?? start + HOUR));

const isDateOnly = (e: Pick<Series, "allDay" | "timeKnown">) => !!e.allDay || e.timeKnown === false;

/** Every day of the run, called-off days left out, whatever the window. A single event is its one day. */
export function allOccurrences(e: Series): Occurrence[] {
  const start = Date.parse(e.startsAt);
  const end = e.endsAt ? Date.parse(e.endsAt) : null;
  const days = e.repeatUntil ? Math.max(0, daysBetween(manilaDay(start), e.repeatUntil)) : 0;
  const skipped = new Set(e.skipDates ?? []);
  const out: Occurrence[] = [];
  for (let k = 0; k <= days; k++) {
    const s = start + k * DAY;
    const day = manilaDay(s);
    if (skipped.has(day)) continue;
    out.push({ day, startsAt: new Date(s).toISOString(), endsAt: end === null ? null : new Date(end + k * DAY).toISOString() });
  }
  return out;
}

/** Occurrences still going on or starting inside [from, to] (ms). */
export function occurrencesIn(e: Series, from: number, to: number): Occurrence[] {
  const dateOnly = isDateOnly(e);
  return allOccurrences(e).filter((o) => {
    const s = Date.parse(o.startsAt);
    return s <= to && endOf(s, o.endsAt ? Date.parse(o.endsAt) : null, dateOnly) > from;
  });
}

/** Whether any occurrence is still to come or going on at `now`. */
export const hasOccurrenceLeft = (e: Series, now: number) => allOccurrences(e).some((o) => endOf(Date.parse(o.startsAt), o.endsAt ? Date.parse(o.endsAt) : null, isDateOnly(e)) > now);

/** The nights not yet over at `now`, in order. */
export const nightsLeft = (e: Series, now: number): Occurrence[] => {
  const dateOnly = isDateOnly(e);
  return allOccurrences(e).filter((o) => endOf(Date.parse(o.startsAt), o.endsAt ? Date.parse(o.endsAt) : null, dateOnly) > now);
};

/** The one that is on now or next, else the last one. What a series id stands for when a link, result or notice names it. */
export function focusOccurrence(e: Series, now: number): Occurrence | undefined {
  const all = allOccurrences(e);
  const dateOnly = isDateOnly(e);
  return all.find((o) => endOf(Date.parse(o.startsAt), o.endsAt ? Date.parse(o.endsAt) : null, dateOnly) > now) ?? all[all.length - 1];
}

/** The occurrence a moment belongs to: the one whose start is closest to it. Used to pin a started or ended mark to its night. */
export function occurrenceNear(e: Series, at: number): Occurrence {
  const all = allOccurrences(e);
  return all.reduce((best, o) => (Math.abs(Date.parse(o.startsAt) - at) < Math.abs(Date.parse(best.startsAt) - at) ? o : best));
}

/** `<eventId>@<day>`, the id of one occurrence. */
export const occurrenceId = (eventId: string, day: string) => `${eventId}@${day}`;

/** Splits an id into the event id and the day, or the day as null for a plain event id. */
export function parseOccurrenceId(id: string): { eventId: string; day: string | null } {
  const m = id.match(/^(.+)@(\d{4}-\d{2}-\d{2})$/);
  return m ? { eventId: m[1], day: m[2] } : { eventId: id, day: null };
}

/** The first and last day of the run, `YYYY-MM-DD` (the same day for a single event). */
export const runOf = (e: Series) => ({ from: manilaDay(e.startsAt), until: e.repeatUntil ?? manilaDay(e.startsAt) });

/** "Sat 18 Oct" for a `YYYY-MM-DD` day. */
export const dayStampOf = (day: string) => dayStamp(new Date(dayStart(day)).toISOString());

/** "5–9 Oct", "28 Oct–3 Nov" or "5 Oct" for a run's days. */
export function dayRange(from: string, until: string) {
  const part = (day: string, withMonth: boolean) => new Date(dayStart(day)).toLocaleDateString("en-GB", { day: "numeric", ...(withMonth && { month: "short" }), timeZone: "Asia/Manila" });
  if (from === until) return part(from, true);
  const sameMonth = from.slice(0, 7) === until.slice(0, 7);
  return `${part(from, !sameMonth)}–${part(until, true)}`;
}

/** What a repeating event shows in the team lists: "Daily, 5–9 Oct, 5:00 PM–2:00 AM". A single event gives its plain time. */
export function runLabel(e: Series) {
  const when = eventTime({ startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, timeKnown: e.timeKnown });
  if (!e.repeatUntil) return when;
  const { from, until } = runOf(e);
  return `Daily, ${dayRange(from, until)}, ${e.allDay || e.timeKnown === false ? when.toLowerCase() : when.replace(" – ", "–")}`;
}

/** "Daily until Sat 31 Oct", for a card of one night. */
export const dailyUntil = (series: { until: string }) => `Daily until ${dayStampOf(series.until)}`;

/** The when of a new repeating event's feed headline: "daily 5:00 PM–2:00 AM, 5–31 Oct". */
export function repeatWhen(e: Series) {
  const { from, until } = runOf(e);
  const when = eventTime({ startsAt: e.startsAt, endsAt: e.endsAt, allDay: e.allDay, timeKnown: e.timeKnown });
  return `daily ${e.allDay || e.timeKnown === false ? when.toLowerCase() : when.replace(" – ", "–")}, ${dayRange(from, until)}`;
}

type Card = Pick<Series, "startsAt" | "endsAt" | "allDay" | "timeKnown"> & { id: string; seriesId?: string };

const cardEnd = (e: Card) => endOf(Date.parse(e.startsAt), e.endsAt ? Date.parse(e.endsAt) : null, isDateOnly(e));

/**
 * The card an id stands for: itself if it is a card's id, else, for a daily event's own id, its night
 * that is on now or next (the last one if the run is over). Anything else comes back as it was.
 */
export function resolveEventId(cards: readonly Card[], id: string, now: number): string {
  if (cards.some((c) => c.id === id)) return id;
  const nights = cards.filter((c) => c.seriesId === id).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return (nights.find((c) => cardEnd(c) > now) ?? nights[nights.length - 1])?.id ?? id;
}

/** One card per daily event (the night that is on now or next), for lists that name events rather than nights. */
export function onePerSeries<T extends Card>(cards: readonly T[], now: number): T[] {
  const keep = new Set(cards.filter((c) => c.seriesId).map((c) => c.seriesId!).map((s) => resolveEventId(cards, s, now)));
  return cards.filter((c) => !c.seriesId || keep.has(c.id));
}

/** "tonight", "today", "tomorrow" or "Sat 18 Oct": when a night starting at `startsAt` falls, for a change that applies from then. */
export function fromWhen(startsAt: string, now: number) {
  const day = manilaDay(startsAt);
  const evening = Date.parse(startsAt) - dayStart(day) >= 17 * HOUR;
  if (day === manilaDay(now)) return evening ? "tonight" : "today";
  return day === manilaDay(now + DAY) ? "tomorrow" : dayStampOf(day);
}
