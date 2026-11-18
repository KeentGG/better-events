import { onNow } from "./dailyWindow";
import type { TrafficArea } from "./types";

/** An active closure post, as `/api/traffic` reads it. `extent` is null for the whole road. */
export interface ActiveClosure {
  area: string;
  publishedAt: Date;
  extent: "partial" | null;
  /** Daily hours (minutes after midnight, Manila): the road is closed only inside them. */
  dailyFrom?: number | null;
  dailyTo?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

/**
 * Lays active closures over the roads' latest readings: a road with a closure shows closed, or partly
 * closed when every closure on it is partial, so a full closure wins over a partial one. Either one
 * replaces the road's reading, since it is not a reading that fades. A closure with daily hours counts only
 * inside them; outside, the road reads as it otherwise would.
 */
export function overlayClosures(latest: Map<string, TrafficArea>, closures: ActiveClosure[], now = new Date()) {
  const byRoad = new Map<string, ActiveClosure[]>();
  const inForce = (c: ActiveClosure) =>
    c.dailyFrom == null || c.dailyTo == null || onNow({ startsAt: c.startsAt?.toISOString() ?? null, endsAt: c.endsAt?.toISOString() ?? null, dailyFrom: c.dailyFrom, dailyTo: c.dailyTo }, now.getTime());
  for (const c of closures.filter(inForce)) byRoad.set(c.area, [...(byRoad.get(c.area) ?? []), c]);
  for (const [area, list] of byRoad) {
    const full = list.some((c) => c.extent === null);
    const deciding = full ? list.filter((c) => c.extent === null) : list;
    const newest = deciding.reduce((a, b) => (b.publishedAt > a.publishedAt ? b : a));
    latest.set(area, { area, level: full ? "closed" : "partial", reports: (latest.get(area)?.reports ?? 0) + list.length, updatedAt: newest.publishedAt.toISOString() });
  }
  return latest;
}
