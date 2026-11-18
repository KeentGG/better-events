import { dayStampOf, dayStart, manilaDay } from "./occurrences";
import { dayTime } from "./time";

/** A range with daily hours: "every day between `dailyFrom` and `dailyTo`" (minutes after midnight, Manila), from `startsAt` to `endsAt`. */
export interface DailyItem {
  startsAt: string | null;
  endsAt: string | null;
  dailyFrom?: number | null;
  dailyTo?: number | null;
}

const MINUTE = 60_000;

/** Minutes after midnight in Manila at a moment. */
export const minutesOfDay = (ms: number) => Math.floor((((ms + 8 * 3_600_000) % 86_400_000) + 86_400_000) % 86_400_000 / MINUTE);

/** "5:00 PM" for minutes after midnight. */
export function clockOfMinutes(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "5:00 PM–2:00 AM". */
export const dailyHours = (from: number, to: number) => `${clockOfMinutes(from)}–${clockOfMinutes(to)}`;

/** Why daily hours can't go with this range, or null. Both or neither, in a day, and only on a range that spans days. */
export function dailyProblem(startsAt: string | null | undefined, endsAt: string | null | undefined, from: number | null | undefined, to: number | null | undefined): string | null {
  if ((from == null) !== (to == null)) return "Give both the first and last hour of the day, or neither.";
  if (from == null || to == null) return null;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 1439 || to < 0 || to > 1439) return "Daily hours are minutes after midnight, 0 to 1439.";
  if (from === to) return "The daily hours start and end at the same time.";
  if (!startsAt || !endsAt) return "Daily hours need both a start and an end day.";
  if (manilaDay(endsAt) <= manilaDay(startsAt)) return "Daily hours are for a range that ends on a later day than it starts.";
  return null;
}

/**
 * Whether an item is on at `now`: inside its range, and, when it has daily hours, inside them (a window that
 * ends at or before its start runs past midnight). Without daily hours this is just the range.
 */
export function onNow(item: DailyItem, now: number): boolean {
  if (item.startsAt && Date.parse(item.startsAt) > now) return false;
  if (item.endsAt && Date.parse(item.endsAt) < now) return false;
  if (item.dailyFrom == null || item.dailyTo == null) return true;
  const m = minutesOfDay(now);
  return item.dailyFrom < item.dailyTo ? m >= item.dailyFrom && m < item.dailyTo : m >= item.dailyFrom || m < item.dailyTo;
}

/** "Daily 5:00 PM–2:00 AM until Sat 31 Oct" for a daily item, or null. */
export function dailyLine(item: DailyItem): string | null {
  if (item.dailyFrom == null || item.dailyTo == null) return null;
  return `Daily ${dailyHours(item.dailyFrom, item.dailyTo)}${item.endsAt ? ` until ${dayStampOf(manilaDay(item.endsAt))}` : ""}`;
}

/** The daily line when there is one, else the plain "From … until …" words. */
export function rangeLine(item: DailyItem, now = new Date()): string {
  const daily = dailyLine(item);
  if (daily) return daily;
  return [item.startsAt && `From ${dayTime(item.startsAt, now)}`, item.endsAt && `${item.startsAt ? "until" : "Until"} ${dayTime(item.endsAt, now)}`].filter(Boolean).join(" ");
}

/**
 * When the next daily window opens, as an ISO time: the first window start after `from` that is still inside the
 * range. Null when the item has no daily hours or the run is over. (Ask it when the item is not on now.)
 */
export function nextWindowStart(item: DailyItem, from: number): string | null {
  if (item.dailyFrom == null || item.dailyTo == null) return null;
  const midnight = dayStart(manilaDay(from));
  for (let d = 0; d < 2; d++) {
    const at = midnight + d * 86_400_000 + item.dailyFrom * MINUTE;
    if (at <= from) continue;
    if (item.endsAt && at > Date.parse(item.endsAt)) return null;
    return new Date(at).toISOString();
  }
  return null;
}
