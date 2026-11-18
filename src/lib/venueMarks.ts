import type { FeatureCollection } from "geojson";
import { areaPoint, type LngLat } from "./areaPoint";
import { phaseOf } from "./eventPhase";
import { VENUE_ROLE_LABEL, type ScheduleEvent } from "./types";

/** How far ahead of its start an event's venues go on the traffic map. */
export const MARK_AHEAD_MS = 3 * 3_600_000;

export interface VenueMark {
  /** The event and the venue's line on it, for the tap: "Streetdance: Ends at Paglaum Stadium". */
  text: string;
  at: LngLat;
}

/**
 * The extra venues to mark on the traffic map: those of events that are on now or start within three hours.
 * A venue with no area, or an area with no saved geometry, is left off. Called-off, finished and date-only
 * events have no "soon" and are skipped, and a daily event's nights are cards of their own, so the
 * same venue is marked once.
 */
export function venueMarks(schedule: ScheduleEvent[] | undefined, roads: FeatureCollection, now = Date.now()): VenueMark[] {
  const out: VenueMark[] = [];
  const seen = new Set<string>();
  for (const e of schedule ?? []) {
    if (!e.venues?.length) continue;
    const phase = phaseOf(e, now);
    const soon = phase === "next" && !e.allDay && e.timeKnown !== false && e.status !== "tba" && Date.parse(e.startsAt) - now <= MARK_AHEAD_MS;
    if (phase !== "live" && !soon) continue;
    for (const v of e.venues) {
      const key = `${e.seriesId ?? e.id}|${v.role}|${v.venue}`;
      if (!v.area || seen.has(key)) continue;
      const at = areaPoint(v.area, roads);
      if (!at) continue;
      seen.add(key);
      out.push({ text: `${e.title}: ${VENUE_ROLE_LABEL[v.role]} ${v.venue}`, at });
    }
  }
  return out;
}
