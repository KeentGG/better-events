import { z } from "zod";
import { GROUPS, type GroupKey } from "./config";

/** Group keys a lane check accepts, in wall order. */
export const LANE_IDS: readonly GroupKey[] = GROUPS.map((g) => g.key);

const MINUTE = 60_000;

/** Gray when nothing in the lane is newer than its stale window. */
export function laneIsStale(lastUpdateAt: string | null, staleMinutes: number, now: Date) {
  return !lastUpdateAt || now.getTime() - Date.parse(lastUpdateAt) > staleMinutes * MINUTE;
}

/**
 * What the tile shows for a check. The clock column already prints the time, so the line is
 * "Checked, nothing new", with the note and sources after a dash (the tile's title shows the rest).
 */
export function checkedLine(note: string | null, sources: readonly string[]) {
  const extra = [note?.trim(), sources.length ? sources.join(", ") : ""].filter(Boolean).join(" · ");
  return extra ? `Checked, nothing new — ${extra}` : "Checked, nothing new";
}

export const laneCheckBody = z.object({
  checkedAt: z.iso.datetime({ offset: true }).optional(),
  note: z.string().trim().max(500).optional(),
  sources: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
});
