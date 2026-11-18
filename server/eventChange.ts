import type { events } from "./db/schema";
import { manilaMidnight } from "../src/lib/eventPhase";
import { dayStampOf, dayStart, focusOccurrence, fromWhen, manilaDay, nightsLeft, occurrenceNear, type Series } from "../src/lib/occurrences";
import { clock, dayStamp, extendedUntil, movedToDay, startsEarlier } from "../src/lib/time";
import type { Category } from "../src/lib/types";

export type EventRow = typeof events.$inferSelect;

/** How far ahead of the server clock a started or ended time may be, for a desk clock that runs fast. */
const SLACK = 5 * 60_000;
/** How much sooner than planned an end must be to read as "Ended early". */
const EARLY_END = 10 * 60_000;

export interface EventChangeInput {
  change: "retime" | "delay" | "extend" | "early" | "move" | "tba" | "cancel" | "venue" | "on_time" | "started" | "ended";
  newStart?: string;
  /** The new planned end, for a retime or the older extend and early. */
  newEnd?: string;
  /** For a retime of a date-only event: move the day and leave it date-only. */
  keepDateOnly?: boolean;
  venue?: string;
  /** The area a venue change moves to, by id or by name (the desk's picker has names). */
  areaId?: string;
  area?: string;
  note?: string;
  /** When it actually started or ended, if not now. */
  at?: string;
  /** For a cancel of a repeating event: the one day (`YYYY-MM-DD`) called off. Left out cancels the rest of the run. */
  day?: string;
}

export type EventChangePlan =
  | { error: string }
  /** `publish: false` is a schedule-only change: no feed item, no tier. */
  /** `area` is where the feed item sits: the new area after a venue change, else the event's. */
  | { set: Partial<typeof events.$inferInsert>; title: string; category: Category; publish: boolean; area?: string };

export type AreaRow = { id: string; name: string };

/** What one change does to an event and how it reads in the feed. Pure, so the rules are testable without a database. */
export function planEventChange(ev: EventRow, u: EventChangeInput, now: Date, areas: readonly AreaRow[]): EventChangePlan {
  const newArea = u.areaId || u.area ? areas.find((a) => (u.areaId ? a.id === u.areaId : a.name === u.area)) : undefined;
  if ((u.areaId || u.area) && !newArea) return { error: "unknown area" };
  const plan = planChange(ev, u, now);
  if ("error" in plan) return plan;
  if (u.change === "venue" && newArea) plan.set.areaId = newArea.id;
  const areaId = plan.set.areaId ?? ev.areaId;
  return { ...plan, area: areas.find((a) => a.id === areaId)?.name };
}

/** A repeating event's row as the occurrence helpers read it. */
const seriesOf = (ev: EventRow): Series => ({ startsAt: ev.plannedStart.toISOString(), endsAt: ev.plannedEnd?.toISOString() ?? null, allDay: ev.allDay, timeKnown: ev.timeKnown, repeatUntil: ev.repeatUntil, skipDates: ev.skipDates });

const REPEATS = "This event repeats every day. To change the days it runs, change the range in the schedule editor.";

/** A change to a repeating event: its hours are the daily hours, and started and ended belong to one night. */
function planSeries(ev: EventRow, u: EventChangeInput, now: Date): EventChangePlan | undefined {
  const series = seriesOf(ev);
  const dateOnly = ev.allDay || ev.timeKnown === false;
  switch (u.change) {
    case "move":
      return { error: REPEATS };
    case "tba":
    case "extend":
    case "early":
      return { error: "A repeating event's hours change as a whole. Use Change time." };
    case "cancel": {
      if (!u.day) return undefined;
      const left = nightsLeft(series, now.getTime());
      if (!left.some((o) => o.day === u.day)) return { error: "Pick one of the days still to come." };
      if (left.length === 1) return { error: "That is the last day left. Cancel the rest of the run instead." };
      return { set: { skipDates: [...ev.skipDates, u.day].sort() }, title: `No ${ev.title} on ${dayStampOf(u.day)}`, category: "cancellation", publish: true };
    }
    case "delay":
    case "retime": {
      if (u.keepDateOnly && dateOnly) return { error: REPEATS };
      const newStart = u.newStart ? new Date(u.newStart) : undefined;
      const newEnd = u.newEnd ? new Date(u.newEnd) : undefined;
      if ((newStart && Number.isNaN(newStart.getTime())) || (newEnd && Number.isNaN(newEnd.getTime()))) return { error: "Pick a valid time." };
      if (!newStart) return { error: "Pick the new start time." };
      // Another day than the run's is a move; the day shown is whichever night the team picked the new hours from.
      const day = manilaDay(newStart.getTime());
      if (day < manilaDay(ev.plannedStart.getTime()) || day > ev.repeatUntil!) return { error: REPEATS };
      if (newEnd && newEnd <= newStart) return { error: "The end is before the start." };
      // The hours are the first day's, the new clock on that day; the end keeps its distance unless one is given.
      const first = manilaDay(ev.plannedStart.getTime());
      const plannedStart = new Date(dayStart(first) + (newStart.getTime() - dayStart(day)));
      const length = newEnd ? newEnd.getTime() - newStart.getTime() : ev.plannedEnd && !dateOnly ? ev.plannedEnd.getTime() - ev.plannedStart.getTime() : null;
      const plannedEnd = length === null ? null : new Date(plannedStart.getTime() + length);
      if (!dateOnly && plannedStart.getTime() === ev.plannedStart.getTime() && plannedEnd?.getTime() === ev.plannedEnd?.getTime()) return { error: "Nothing changed yet." };
      const next = focusOccurrence(series, now.getTime());
      const line = `From ${next ? fromWhen(new Date(Date.parse(next.startsAt) + (plannedStart.getTime() - ev.plannedStart.getTime())).toISOString(), now.getTime()) : "now on"}: ${clock(plannedStart.toISOString())}${newEnd ? `–${clock(plannedEnd!.toISOString())}` : ""}`;
      return {
        set: { allDay: false, timeKnown: true, originalKind: null, status: "scheduled", plannedStart, plannedEnd, note: scheduleNote(ev.note, line, u.note) },
        title: announced(ev.title, line),
        category: "schedule_change",
        publish: true,
      };
    }
    case "started": {
      const when = u.at ? new Date(u.at) : now;
      if (when.getTime() > now.getTime() + SLACK) return { error: "It can't have started in the future. Leave the time empty for now." };
      // The mark belongs to one night: it doesn't make the run ongoing, and the next night starts clean.
      return { set: { actualStart: when, actualEnd: null }, title: `${ev.title} started`, category: "schedule_change", publish: false };
    }
    case "ended": {
      const when = u.at ? new Date(u.at) : now;
      if (when.getTime() > now.getTime() + SLACK) return { error: "It can't have ended in the future. Leave the time empty for now." };
      const night = occurrenceNear(series, when.getTime());
      const sameNight = !!ev.actualStart && occurrenceNear(series, ev.actualStart.getTime()).day === night.day;
      const start = sameNight ? ev.actualStart! : new Date(night.startsAt);
      if (when < start) return { error: `That's before it started (${clock(start.toISOString())}).` };
      // Tonight is over; the run isn't, so the status stays and only this night's marks are set.
      // The note is the whole run's, so an early end isn't written to it.
      return {
        set: { actualStart: sameNight ? ev.actualStart : null, actualEnd: when },
        title: `${ev.title} ended`,
        category: "schedule_change",
        publish: false,
      };
    }
    default:
      return undefined;
  }
}

function planChange(ev: EventRow, u: EventChangeInput, now: Date): EventChangePlan {
  if (u.change === "cancel" && u.day && !ev.repeatUntil) return { error: "Only a repeating event can have one day called off." };
  if (ev.repeatUntil) {
    const plan = planSeries(ev, u, now);
    if (plan) return plan;
  }
  const at = (iso: string) => clock(iso);
  // The first time a change moves the start, remember the one it had.
  const original = ev.originalStart ?? ev.plannedStart;
  // A new time, a wait for one, or back on schedule means it hasn't run yet: drop any started or ended mark,
  // which also undoes one made by mistake.
  const rerun = { actualStart: null, actualEnd: null };
  // A date-only event given a time is a timed event from then on, and has no earlier clock to move from.
  const dateOnly = ev.allDay || ev.timeKnown === false;
  const timed = { allDay: false, timeKnown: true };
  // What the first start was without a clock, remembered so readers see only the old day and Back restores it.
  const kind = ev.originalKind ?? (dateOnly ? (ev.allDay ? "all_day" : "time_tba") : null);
  // Back on the first start: it gets its flags back, and drops the kind, if it had none.
  const restored = { allDay: ev.originalKind ? ev.originalKind === "all_day" : ev.allDay, timeKnown: ev.originalKind ? ev.originalKind !== "time_tba" : ev.timeKnown, originalKind: null };
  const restoredStatus = ev.originalKind ? (ev.originalKind === "time_tba" ? "tba" : "scheduled") : ev.timeKnown === false ? "tba" : "scheduled";
  const backDateOnly = dateOnly || !!ev.originalKind;
  // A new day, with the planned times it lands on: the first start again if that's where it ends up.
  const moveTo = (plannedStart: Date, plannedEnd: Date | null | undefined, line: string): EventChangePlan => {
    // Back on the first day keeps the clock, so it is the original plan again.
    if (ev.status !== "cancelled" && plannedStart.getTime() === original.getTime()) {
      return {
        set: { ...rerun, ...restored, status: restoredStatus, originalStart: null, plannedStart, plannedEnd: ev.originalKind ? null : plannedEnd, note: u.note ?? null },
        title: backDateOnly ? `${ev.title} is back on ${dayStamp(plannedStart.toISOString())}` : `${ev.title} is back on schedule at ${at(plannedStart.toISOString())}`,
        category: "schedule_change",
        publish: true,
      };
    }
    const status =
      ev.status === "cancelled" ? "cancelled" : ev.timeKnown === false ? "tba" : ev.allDay ? "scheduled" : plannedStart > original ? "delayed" : "scheduled";
    return {
      set: { ...(ev.status === "cancelled" ? {} : rerun), originalStart: original, originalKind: kind, status, plannedStart, plannedEnd, note: scheduleNote(ev.note, line, u.note) },
      title: announced(ev.title, line),
      category: "schedule_change",
      publish: true,
    };
  };
  // A new planned end alone: longer reads "Extended until", shorter reads "Now ends at".
  const endChange = (newEnd: Date): EventChangePlan => {
    const line = ev.plannedEnd && newEnd > ev.plannedEnd ? extendedUntil(newEnd.toISOString(), ev.plannedEnd.toISOString()) : `Now ends at ${at(newEnd.toISOString())}`;
    return { set: { plannedEnd: newEnd, note: scheduleNote(ev.note, line, u.note) }, title: announced(ev.title, line), category: "schedule_change", publish: true };
  };
  switch (u.change) {
    case "delay": {
      if (!u.newStart) return { error: "newStart is required for a new time" };
      const newStart = new Date(u.newStart);
      const shift = newStart.getTime() - ev.plannedStart.getTime();
      const plannedEnd = ev.plannedEnd && new Date(ev.plannedEnd.getTime() + shift);
      // A date-only event has no clock to move from. Giving it one makes it a timed event, and that time is the plan.
      if (dateOnly) {
        return {
          set: { ...rerun, ...timed, originalStart: null, originalKind: null, status: "scheduled", plannedStart: newStart, plannedEnd, note: u.note ?? null },
          title: announced(ev.title, `Starts at ${at(newStart.toISOString())}`),
          category: "schedule_change",
          publish: true,
        };
      }
      // Late or not is measured from the first start, so a second, smaller delay is still a delay.
      if (newStart.getTime() === original.getTime()) {
        return {
          set: { ...rerun, ...(ev.originalKind ? restored : { ...timed, originalKind: null }), originalStart: null, status: restoredStatus, plannedStart: newStart, plannedEnd: ev.originalKind ? null : plannedEnd, note: u.note ?? null },
          title: ev.originalKind ? `${ev.title} is back on ${dayStamp(newStart.toISOString())}` : `${ev.title} is back on schedule at ${at(newStart.toISOString())}`,
          category: "schedule_change",
          publish: true,
        };
      }
      const later = newStart > original;
      const line = startsEarlier(newStart.toISOString());
      return {
        set: {
          ...rerun,
          ...timed,
          originalStart: original,
          status: later ? "delayed" : "scheduled",
          plannedStart: newStart,
          plannedEnd,
          note: [`Moved from ${at(ev.plannedStart.toISOString())}`, u.note?.trim()].filter(Boolean).join(". "),
        },
        title: later ? `${ev.title} delayed to ${at(newStart.toISOString())}` : announced(ev.title, line),
        category: later ? "delay" : "schedule_change",
        publish: true,
      };
    }
    case "extend":
    case "early": {
      if (dateOnly) return { error: "Set a start time first. This event has no clock." };
      if (!ev.plannedEnd) return { error: "This event has no end time." };
      if (!u.newEnd) return { error: "Pick the new end time." };
      const newEnd = new Date(u.newEnd);
      if (newEnd <= ev.plannedStart) return { error: "The end is before the start." };
      if (u.change === "extend" && newEnd <= ev.plannedEnd) return { error: "Pick a later end." };
      if (u.change === "early" && newEnd >= ev.plannedEnd) return { error: "Pick an earlier end." };
      return endChange(newEnd);
    }
    case "move": {
      if (!u.newStart) return { error: "Pick the day it moves to." };
      const delta = manilaMidnight(u.newStart) - manilaMidnight(ev.plannedStart.toISOString());
      if (delta === 0) return { error: "Pick a different day. To change the time, use Change time." };
      const plannedStart = new Date(ev.plannedStart.getTime() + delta);
      return moveTo(plannedStart, ev.plannedEnd && new Date(ev.plannedEnd.getTime() + delta), movedToDay(plannedStart.toISOString()));
    }
    case "retime": {
      if (u.keepDateOnly && dateOnly) return planChange(ev, { change: "move", newStart: u.newStart, note: u.note }, now);
      const newStart = u.newStart ? new Date(u.newStart) : undefined;
      const newEnd = u.newEnd ? new Date(u.newEnd) : undefined;
      if ((newStart && Number.isNaN(newStart.getTime())) || (newEnd && Number.isNaN(newEnd.getTime()))) return { error: "Pick a valid time." };
      const startMoved = !!newStart && newStart.getTime() !== ev.plannedStart.getTime();
      if (!startMoved) {
        if (!newEnd) return { error: "Nothing changed yet." };
        if (dateOnly) return { error: "Set a start time first. This event has no clock." };
        if (ev.plannedEnd && newEnd.getTime() === ev.plannedEnd.getTime()) return { error: "Nothing changed yet." };
        if (newEnd <= ev.plannedStart) return { error: "The end is before the start." };
        return endChange(newEnd);
      }
      if (newEnd && newEnd <= newStart!) return { error: "The end is before the start." };
      // Another day is a move, whatever the clock does. The end keeps its distance from the start unless one is given.
      if (manilaMidnight(newStart!.toISOString()) !== manilaMidnight(ev.plannedStart.toISOString())) {
        const shift = newStart!.getTime() - ev.plannedStart.getTime();
        const plan = moveTo(newStart!, newEnd ?? (ev.plannedEnd && new Date(ev.plannedEnd.getTime() + shift)), `${movedToDay(newStart!.toISOString())}, ${at(newStart!.toISOString())}`);
        // A date-only event given a time on another day is timed from then on; the old day stays struck through.
        if (dateOnly && "set" in plan && plan.set.originalStart) Object.assign(plan.set, timed, { status: "scheduled" });
        return plan;
      }
      const plan = planChange(ev, { change: "delay", newStart: u.newStart, note: u.note }, now);
      if (newEnd && "set" in plan) plan.set.plannedEnd = newEnd;
      return plan;
    }
    case "tba":
      return {
        set: { ...rerun, originalStart: original, originalKind: kind, status: "tba", note: u.note ?? "Time to follow" },
        title: `${ev.title} delayed, time to follow`,
        category: "delay",
        publish: true,
      };
    case "cancel":
      return { set: { status: "cancelled", note: u.note ?? "Cancelled" }, title: `Cancelled: ${ev.title}`, category: "cancellation", publish: true };
    case "venue":
      if (!u.venue) return { error: "venue is required for a venue change" };
      return {
        set: { venue: u.venue, note: u.note ?? `Moved from ${ev.venue ?? "the old venue"}` },
        title: `${ev.title} moves to ${u.venue}`,
        category: "schedule_change",
        publish: true,
      };
    case "on_time": {
      const back = ev.originalStart;
      const shift = back ? back.getTime() - ev.plannedStart.getTime() : 0;
      return {
        set: {
          ...rerun,
          status: "scheduled",
          note: u.note ?? null,
          ...(back && { plannedStart: back, plannedEnd: ev.originalKind ? null : ev.plannedEnd && new Date(ev.plannedEnd.getTime() + shift), originalStart: null, ...restored }),
          ...(back && ev.originalKind && { status: restoredStatus }),
        },
        title: back && ev.originalKind ? `${ev.title} is back on ${dayStamp(back.toISOString())}` : back ? `${ev.title} is back on schedule at ${at(back.toISOString())}` : `${ev.title} is back on schedule`,
        category: "schedule_change",
        publish: true,
      };
    }
    case "started": {
      const when = u.at ? new Date(u.at) : now;
      if (when.getTime() > now.getTime() + SLACK) return { error: "It can't have started in the future. Leave the time empty for now." };
      return { set: { status: "ongoing", actualStart: when }, title: `${ev.title} started`, category: "schedule_change", publish: false };
    }
    case "ended": {
      const when = u.at ? new Date(u.at) : now;
      if (when.getTime() > now.getTime() + SLACK) return { error: "It can't have ended in the future. Leave the time empty for now." };
      const start = ev.actualStart ?? ev.plannedStart;
      if (when < start) return { error: `That's before it started (${at(start.toISOString())}).` };
      // Well before the planned end reads as early, in the past tense because it has already happened.
      const early = !dateOnly && !!ev.plannedEnd && ev.plannedEnd.getTime() - when.getTime() > EARLY_END;
      const line = `Ended early, at ${at(when.toISOString())}`;
      return {
        set: { status: "done", actualEnd: when, ...(early && { note: scheduleNote(ev.note, line, u.note) }) },
        title: early ? announced(ev.title, line.replace(/, at .*/, "")) : `${ev.title} ended`,
        category: "schedule_change",
        publish: false,
      };
    }
  }
}

/** "Grand Parade extended until 9:00 PM" from a line that starts with a capital. */
function announced(title: string, line: string) {
  return `${title} ${line.charAt(0).toLowerCase()}${line.slice(1)}`;
}

/**
 * The line readers see for a new end or a new day. A "Moved from …" sentence already on the event stays
 * in front of it: a typed note and a venue change replace that sentence, and these changes must not.
 */
function scheduleNote(existing: string | null, line: string, typed?: string) {
  const moved = existing?.match(/^Moved from [^.]+/)?.[0];
  const extra = typed?.trim();
  return [moved, line, extra && extra !== line ? extra : undefined].filter(Boolean).join(". ");
}
