/**
 * Where to find a place, as readers see it: the area people head for, then the team's own directions.
 * "Near the stage" alone is no help on a festival with a stage on every corner, so the area comes first,
 * unless the directions already name it ("Public Plaza, near the stage").
 */
export function whereLine(where: string | null | undefined, area: string | null | undefined) {
  const w = where?.trim() ?? "";
  const a = area?.trim() ?? "";
  if (!a || w.toLowerCase().includes(a.toLowerCase())) return w;
  return w ? `${a} · ${w}` : a;
}

/** Whether a place is temporarily closed right now: it has a "closed until" time that is still ahead. */
export function isClosedNow(closedUntil: string | null | undefined, now = new Date()) {
  return !!closedUntil && new Date(closedUntil).getTime() > now.getTime();
}

/** "Closed until 6:00 PM" later today, or "Closed until Sat 6:00 PM" on another day in Bacolod. */
export function closedLabel(closedUntil: string, now = new Date()) {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const at = new Date(closedUntil);
  const time = at.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
  if (day(at) === day(now)) return `Closed until ${time}`;
  return `Closed until ${at.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Manila" })} ${time}`;
}
