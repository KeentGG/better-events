const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string) {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return rtf.format(diffH, "hour");
  return rtf.format(Math.round(diffH / 24), "day");
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
}

/** "7 PM", for an hour on a forecast strip. */
export function hourLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", timeZone: "Asia/Manila" });
}

export function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", timeZone: "Asia/Manila" });
}

/** Calendar day in Manila, for grouping. */
export function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** "5 – 6:30 PM", or just the start when there is no end. */
export function timeRange(start: string, end: string | null) {
  return end ? `${clock(start)} – ${clock(end)}` : clock(start);
}

/** "9:00 PM" today, "tomorrow 9:00 PM", or "Sat 18 Oct, 9:00 PM" on another day, for a time on a feed card. */
export function dayTime(iso: string, now = new Date()) {
  const day = dayKey(iso);
  if (day === dayKey(now.toISOString())) return clock(iso);
  if (day === dayKey(new Date(now.getTime() + 86_400_000).toISOString())) return `tomorrow ${clock(iso)}`;
  const date = new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Manila" });
  return `${date}, ${clock(iso)}`;
}

/** What an event shows where its clock would go: "All day", "Time to follow", or the start and end. */
export function eventTime(e: { startsAt: string; endsAt: string | null; allDay?: boolean; timeKnown?: boolean }) {
  if (e.allDay) return "All day";
  if (e.timeKnown === false) return "Time to follow";
  return timeRange(e.startsAt, e.endsAt);
}

/** "Sat 18 Oct", the calendar day in Bacolod, never "today" or "tomorrow". */
export function dayStamp(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Manila" });
}

/** "Extended until 9:00 PM", with the day when the new end falls on another one. */
export function extendedUntil(endIso: string, previousEndIso: string) {
  const when = dayKey(endIso) === dayKey(previousEndIso) ? clock(endIso) : `${dayStamp(endIso)}, ${clock(endIso)}`;
  return `Extended until ${when}`;
}

/** "Moved to Sat 18 Oct". */
export function movedToDay(iso: string) {
  return `Moved to ${dayStamp(iso)}`;
}

/** "Starts earlier, 3:00 PM". */
export function startsEarlier(iso: string) {
  return `Starts earlier, ${clock(iso)}`;
}

/** The first start, struck through once a change has moved it. A date-only event shows the old day, not midnight. */
export function formerWhen(e: { startsAt: string; originalStart?: string | null; wasDateOnly?: boolean; allDay?: boolean; timeKnown?: boolean }): string | null {
  if (!e.originalStart || Date.parse(e.originalStart) === Date.parse(e.startsAt)) return null;
  const sameDay = dayKey(e.originalStart) === dayKey(e.startsAt);
  if (e.wasDateOnly || e.allDay || e.timeKnown === false) return sameDay ? null : dayStamp(e.originalStart);
  return sameDay ? clock(e.originalStart) : `${dayStamp(e.originalStart)}, ${clock(e.originalStart)}`;
}

/** "Today", "tomorrow" or "Sat 18 Oct" for the day `iso` falls on (Bacolod time). */
export function dayOnly(iso: string, now = new Date()) {
  const day = dayKey(iso);
  if (day === dayKey(now.toISOString())) return "today";
  if (day === dayKey(new Date(now.getTime() + 86_400_000).toISOString())) return "tomorrow";
  return dayStamp(iso);
}

/** When an event happens, for a feed headline: "9:00 PM", "Sat 18 Oct, all day" or "tomorrow, time to follow". */
export function eventWhen(e: { startsAt: string; allDay?: boolean; timeKnown?: boolean }, now = new Date()) {
  if (e.allDay) return `${dayOnly(e.startsAt, now)}, all day`;
  if (e.timeKnown === false) return `${dayOnly(e.startsAt, now)}, time to follow`;
  return dayTime(e.startsAt, now);
}
