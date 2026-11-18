import type { ScheduleEvent } from "./types";

export type EventPhase = "live" | "next" | "done" | "cancelled";

const HOUR = 3_600_000;

/** Midnight in Bacolod (UTC+8, no daylight saving) at the start of the day `iso` falls on. */
export const manilaMidnight = (iso: string) => {
  const t = Date.parse(iso) + 8 * HOUR;
  return Math.floor(t / (24 * HOUR)) * 24 * HOUR - 8 * HOUR;
};

/** Whether a finished (or any) event has results to read; those stay bright and findable instead of folding away dimmed. */
export const hasResults = (e: Pick<ScheduleEvent, "results" | "resultsExpectedAt">) => !!e.results || !!e.resultsExpectedAt;

export function phaseOf(e: Pick<ScheduleEvent, "status" | "startsAt" | "endsAt" | "actualStart" | "actualEnd" | "allDay" | "timeKnown">, now = Date.now()): EventPhase {
  if (e.status === "cancelled") return "cancelled";
  if (e.status === "done") return "done";
  // What the team marked wins over the planned times.
  if (e.actualEnd) return "done";
  if (e.actualStart) return "live";
  if (e.status === "tba") return "next";
  // An all-day or time-to-follow event holds its date at 00:00, which isn't a start time. A time-to-follow
  // event is never live until the team marks it started; an all-day one counts as on from 6 AM to 10 PM that day.
  if (e.allDay || e.timeKnown === false) {
    const day = manilaMidnight(e.startsAt);
    if (now >= day + 24 * HOUR) return "done";
    return e.allDay && now >= day + 6 * HOUR && now < day + 22 * HOUR ? "live" : "next";
  }
  const start = Date.parse(e.startsAt);
  const end = e.endsAt ? Date.parse(e.endsAt) : start + HOUR;
  if (now >= end) return "done";
  return now >= start ? "live" : "next";
}

/**
 * How a schedule rail orders its events: what's over (finished, or called off and past its time)
 * apart as `earlier`, so the next event comes first; the rest by start, with time-to-follow events
 * at the end of their day since they could be any time.
 */
export function railOrder<T extends { event: Pick<ScheduleEvent, "startsAt" | "endsAt" | "timeKnown">; phase: EventPhase }>(items: T[], now = Date.now()) {
  const over = (i: T) => i.phase === "done" || (i.phase === "cancelled" && Date.parse(i.event.endsAt ?? i.event.startsAt) < now);
  const key = (i: T) => (i.event.timeKnown === false ? manilaMidnight(i.event.startsAt) + 24 * HOUR - 1 : Date.parse(i.event.startsAt));
  const byKey = (a: T, b: T) => key(a) - key(b);
  return { earlier: items.filter(over).sort(byKey), ahead: items.filter((i) => !over(i)).sort(byKey) };
}
