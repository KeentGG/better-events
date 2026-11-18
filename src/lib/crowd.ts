import type { CrowdArea } from "./types";

/** How crowded a place is, quietest first. Stored as text; the server checks it (server/team.ts). */
export const CROWD_LEVELS = ["quiet", "busy", "packed"] as const;
export type CrowdLevel = (typeof CROWD_LEVELS)[number];

export const crowdLabel: Record<CrowdLevel, string> = { quiet: "Quiet", busy: "Busy", packed: "Packed" };
/** What each level means, shown beside the choice so a first-time reporter picks the same way the team does. */
export const crowdHint: Record<CrowdLevel, string> = { quiet: "plenty of room", busy: "crowded but moving", packed: "hard to move" };

/** Traffic and crowd readings both stop counting after this long without a newer one. */
export const READING_FADE_MS = 90 * 60_000;

/** A suggested crowd level older than this is no longer true, so approving it is refused. */
export const CROWD_APPROVAL_MS = 45 * 60_000;

export const isCrowdLevel = (v: unknown): v is CrowdLevel => CROWD_LEVELS.includes(v as CrowdLevel);

export interface CrowdReading {
  area: string;
  level: string;
  note?: string | null;
  at: Date;
  lat?: number | null;
  lng?: number | null;
}

/** The newest reading per area that is still inside the fade window; an unknown level or a future stamp is dropped. */
export function liveCrowd(readings: CrowdReading[], now: Date, fadeMs = READING_FADE_MS): CrowdArea[] {
  const newest = new Map<string, CrowdReading>();
  for (const r of readings) {
    if (!isCrowdLevel(r.level) || r.at.getTime() > now.getTime() + 60_000) continue;
    const seen = newest.get(r.area);
    if (!seen || r.at > seen.at) newest.set(r.area, r);
  }
  return [...newest.values()]
    .filter((r) => now.getTime() - r.at.getTime() < fadeMs)
    .map((r) => ({
      area: r.area,
      level: r.level as CrowdLevel,
      ...(r.note ? { note: r.note } : {}),
      ...(r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : {}),
      updatedAt: r.at.toISOString(),
    }));
}

/** Packed first, then busy, then quiet; ties keep the newest first. */
export function crowdByLevel(areas: CrowdArea[]): CrowdArea[] {
  return [...areas].sort((a, b) => CROWD_LEVELS.indexOf(b.level) - CROWD_LEVELS.indexOf(a.level) || b.updatedAt.localeCompare(a.updatedAt));
}

/** Whether a suggestion sent at `sentAt` is too old to post as a crowd level. */
export const crowdTooOld = (sentAt: Date, now: Date) => now.getTime() - sentAt.getTime() > CROWD_APPROVAL_MS;
