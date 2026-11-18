import { dailyHours } from "./dailyWindow";
import { dayStampOf, manilaDay } from "./occurrences";
import { clock, dayKey, dayStamp, extendedUntil, movedToDay, startsEarlier } from "./time";
import { NOTICE_CATEGORIES, type Category, type ClosureExtent, type Tier } from "./types";

/** The categories whose times can be changed: advisories, closures and every notice. Winners and event changes are not here. */
export const RETIMABLE: readonly Category[] = ["traffic_advisory", "road_closure", ...NOTICE_CATEGORIES];
export const isRetimable = (category: Category) => RETIMABLE.includes(category);

export interface Times {
  startsAt: Date | null;
  endsAt: Date | null;
}
/** What was asked for: a missing field keeps the current time, `endsAt: null` clears the end. */
export interface RetimeInput {
  startsAt?: Date;
  endsAt?: Date | null;
}

export type RetimePlan = { error: string } | { startsAt: Date | null; endsAt: Date | null; line: string; tier: Tier };

const HOUR = 3_600_000;
const same = (a: Date | null, b: Date | null) => (a && b ? a.getTime() === b.getTime() : a === b);

/** The wording for a start that moved, a day change first, then earlier or later. */
function startLine(next: Date, cur: Date | null, now: Date) {
  const iso = next.toISOString();
  // A post with no start has been showing since it was posted, so "another day" is measured from today.
  if (dayKey(iso) !== dayKey((cur ?? now).toISOString())) return movedToDay(iso);
  if (!cur) return `Starts at ${clock(iso)}`;
  return next > cur ? `Starts later, at ${clock(iso)}` : startsEarlier(iso);
}

function endLine(next: Date | null, cur: Date | null, now: Date) {
  if (!next) return "No set end";
  const iso = next.toISOString();
  if (!cur) return `Until ${dayKey(iso) === dayKey(now.toISOString()) ? clock(iso) : `${dayStamp(iso)}, ${clock(iso)}`}`;
  return next > cur ? extendedUntil(iso, cur.toISOString()) : `Now ends at ${dayKey(iso) === dayKey(cur.toISOString()) ? clock(iso) : `${dayStamp(iso)}, ${clock(iso)}`}`;
}

/**
 * What changing a post's times does and how it reads: the change wording, the new times, and the tier to suggest
 * (Pinned when the day changes or a time shifts by an hour or more, Feed otherwise). Pure, like planEventChange.
 * Ending a post right now is the End now action, so an end already past is refused here.
 */
export function planRetime(cur: Times, input: RetimeInput, now: Date): RetimePlan {
  const startsAt = input.startsAt ?? cur.startsAt;
  const endsAt = input.endsAt === undefined ? cur.endsAt : input.endsAt;
  const startChanged = !same(startsAt, cur.startsAt);
  const endChanged = !same(endsAt, cur.endsAt);
  if (!startChanged && !endChanged) return { error: "Nothing changed: those are the times it already has." };
  if (startsAt && endsAt && endsAt <= startsAt) return { error: "The end is before the start." };
  if (endChanged && endsAt && endsAt <= now) return { error: "That end has already passed. To end it now, use End now." };

  const dayMoved = startChanged && !!startsAt && dayKey(startsAt.toISOString()) !== dayKey((cur.startsAt ?? now).toISOString());
  // A whole post moved to another day says so once; the end going along with it needs no line of its own.
  const endDayMoved = endChanged && !!endsAt && !!cur.endsAt && dayKey(endsAt.toISOString()) !== dayKey(cur.endsAt.toISOString());
  const line = [startChanged && startLine(startsAt!, cur.startsAt, now), endChanged && !(dayMoved && endDayMoved) && endLine(endsAt, cur.endsAt, now)].filter(Boolean).join(", ");
  const shifted = (a: Date | null, b: Date | null, changed: boolean) => changed && !!a && !!b && Math.abs(a.getTime() - b.getTime()) >= HOUR;
  const tier: Tier = dayMoved || shifted(startsAt, cur.startsAt, startChanged) || shifted(endsAt, cur.endsAt, endChanged) ? 1 : 0;
  return { startsAt, endsAt, line, tier };
}

/** A start or end time as it reads in a headline: "from 6:00 PM", "until 9:00 PM". */
export const spanLabel = (startsAt?: Date | null, endsAt?: Date | null) =>
  startsAt || endsAt ? ` ${[startsAt && `from ${clock(startsAt.toISOString())}`, endsAt && `until ${clock(endsAt.toISOString())}`].filter(Boolean).join(" ")}` : "";

/** The headlines the desk builds for a road, so a retime can rebuild them the same way (and the form can preview them). */
export const advisoryTitle = (road: string, startsAt?: Date | null, endsAt?: Date | null) => `Traffic advisory: ${road}${spanLabel(startsAt, endsAt)}`;
/** With daily hours it reads "Closed daily 3:00 PM–3:00 AM: Lacson St until Sun 25 Oct". */
export const closureTitle = (road: string, startsAt?: Date | null, endsAt?: Date | null, extent?: ClosureExtent | null, daily?: { from: number; to: number } | null) => {
  const word = extent === "partial" ? "Partly closed" : "Closed";
  if (daily && endsAt) return `${word} daily ${dailyHours(daily.from, daily.to)}: ${road} until ${dayStampOf(manilaDay(endsAt.getTime()))}`;
  return `${word}: ${road}${spanLabel(startsAt, endsAt)}`;
};
