import { MAX_PINS } from "../../src/lib/types";

/**
 * Places active announcements on Now: the newest hero is the banner and the newest pins go above the
 * feed, up to MAX_PINS. Rows come newest first. Only one hero is active at a time (publishing one lowers
 * the others), but if two ever were, the older one shows as a pin rather than vanishing.
 */
export function splitTop<T extends { severity: number }>(rows: T[]): { hero: T | null; pins: T[] } {
  const hero = rows.find((r) => r.severity >= 2) ?? null;
  const pins = rows.filter((r) => r !== hero && r.severity >= 1).slice(0, MAX_PINS);
  return { hero, pins };
}
