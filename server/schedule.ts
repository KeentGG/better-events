import { allOccurrences, focusOccurrence, occurrenceId, occurrenceNear, occurrencesIn, runOf, type Occurrence } from "../src/lib/occurrences";
import type { EventStatus, TeamEvent } from "../src/lib/types";

/** The status a reader sees for an event row's status. */
export const readerStatus: Record<TeamEvent["status"], EventStatus> = { scheduled: "on_time", ongoing: "on_time", done: "done", delayed: "delayed", cancelled: "cancelled", tba: "tba" };

const DAY = 24 * 3_600_000;
/** How far ahead the schedule lists the nights of a daily event. */
export const LOOK_AHEAD_DAYS = 7;

/** One schedule card: an event, or one night of a daily one. */
export type ScheduleRow = Omit<TeamEvent, "repeatUntil" | "skipDates"> & {
  /** The event this is a night of, when it repeats. */
  seriesId?: string;
  series?: { from: string; until: string };
  /** Whether results and linked notices (kept per event) show on this card: a single event always, a daily one on the night that is on now or next. */
  carries: boolean;
};

const shifted = (iso: string | null, by: number) => (iso === null ? null : new Date(Date.parse(iso) + by).toISOString());

/** One night of a series. Started and ended marks belong to the night they were made on and nowhere else. */
function night(e: TeamEvent, o: Occurrence, k: number, marked: Occurrence | undefined, carries: boolean): ScheduleRow {
  const { repeatUntil: _until, skipDates: _skip, ...rest } = e;
  const mine = marked?.day === o.day;
  return {
    ...rest,
    id: occurrenceId(e.id, o.day),
    seriesId: e.id,
    series: runOf(e),
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    originalStart: shifted(e.originalStart, k * DAY),
    actualStart: mine ? e.actualStart : null,
    actualEnd: mine ? e.actualEnd : null,
    carries,
  };
}

/**
 * The schedule's cards from the team's event rows (one per series): a single event is one card with its
 * plain id, a daily one a card per night from the look-back through the next week, with ids
 * `<eventId>@<day>`. A run in `keep` (results came in lately) always shows one night. A called-off run keeps only the night that is on or next, so it doesn't fill the page.
 */
export function scheduleRows(rows: TeamEvent[], now: number, lookBackMs: number, keep: ReadonlySet<string> = new Set()): ScheduleRow[] {
  const from = now - lookBackMs;
  const to = now + LOOK_AHEAD_DAYS * DAY;
  const out: ScheduleRow[] = [];
  for (const e of rows) {
    if (!e.repeatUntil) {
      const { repeatUntil: _until, skipDates: _skip, ...rest } = e;
      out.push({ ...rest, carries: true });
      continue;
    }
    const all = allOccurrences(e);
    if (all.length === 0) continue;
    const focus = focusOccurrence(e, now)!;
    const mark = e.actualStart ?? e.actualEnd;
    const marked = mark ? occurrenceNear(e, Date.parse(mark)) : undefined;
    const first = Date.parse(all[0].startsAt);
    let shown = e.status === "cancelled" ? [focus] : occurrencesIn(e, from, to);
    // A run that hasn't begun, further off than a week, still shows its first night.
    if (shown.length === 0 && first > to) shown = [all[0]];
    // A run with recent results keeps a card, on its last night, so late results have somewhere to show.
    if (shown.length === 0 && keep.has(e.id)) shown = [focus];
    for (const o of shown) out.push(night(e, o, Math.round((Date.parse(o.startsAt) - Date.parse(e.startsAt)) / DAY), marked, o.day === focus.day));
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/** The id results and notices are kept under: the event's. */
export const ownerOf = (r: Pick<ScheduleRow, "id" | "seriesId">) => r.seriesId ?? r.id;
