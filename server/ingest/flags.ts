import type { Category, ItemFlag } from "../../src/lib/types";

/** Classifier confidence below this flags an item (docs/MISSION_CONTROL.md §4.2). */
export const LOW_CONFIDENCE = 0.6;
/** Official closures and reopenings this recent are what a crowd post can contradict. */
export const CONFLICT_WINDOW_HOURS = 12;

/** Crowd-sourced posts about these need a person to check them before anyone relies on them. */
const HIGH_STAKES: ReadonlySet<Category> = new Set(["crime_safety", "cancellation", "road_closure", "road_reopening"]);

/** "Lacson is open", in English, Tagalog and Hiligaynon. */
const SAYS_OPEN = /\b(open|opened|bukas|passable|clear(ed)?|nakaagi)\b/i;
const SAYS_CLOSED = /\b(closed|close|sarado|blocked|barricade)/i;

export interface OfficialUpdate {
  /** The official item, which a conflicting post is linked to (`items.conflict_item_id`). */
  id: string;
  category: Category;
  areaId: string;
  /** Null while the closure has no end. */
  endsAt: Date | null;
}

export interface NewItem {
  category: Category;
  confidence: number;
  areaId: string | null;
  text: string;
  /** An official page (tier 1–2). Official items are never flagged. */
  official: boolean;
}

/**
 * The flag a new item gets, or null. Conflict wins over the others because it is the most
 * likely to be misinformation; then unverified high stakes; then low confidence.
 */
export function flagFor(item: NewItem, official: OfficialUpdate[], now: Date): ItemFlag | null {
  if (item.official) return null;
  if (findConflict(item, official, now)) return "conflict";
  if (HIGH_STAKES.has(item.category)) return "unverified_high_stakes";
  if (item.confidence < LOW_CONFIDENCE) return "low_confidence";
  return null;
}

/**
 * What a conflicting post is really claiming. "Lacson open na" against an official closure is a
 * reopening claim whatever the keyword rules made of it, so it lands in the Traffic group
 * next to the closure it contradicts. Other items keep their category.
 */
export function claimedCategory(item: NewItem, official: OfficialUpdate[], now: Date): Category {
  const hit = findConflict(item, official, now);
  if (!hit) return item.category;
  return hit.category === "road_closure" ? "road_reopening" : "road_closure";
}

/**
 * The official update a new item contradicts: one in the same area that it says the opposite of. Never
 * for official items or items with no area. The classifier stores it as the item's `conflict_item_id`.
 */
export function findConflict(item: NewItem, official: OfficialUpdate[], now: Date): OfficialUpdate | undefined {
  if (item.official || !item.areaId) return undefined;
  return official.find((o) => o.areaId === item.areaId && contradicts(item, o, now));
}

function contradicts(item: NewItem, o: OfficialUpdate, now: Date) {
  const closureActive = o.category === "road_closure" && (!o.endsAt || o.endsAt > now);
  if (closureActive) return item.category === "road_reopening" || (item.category !== "road_closure" && SAYS_OPEN.test(item.text));
  if (o.category === "road_reopening") return item.category === "road_closure" || (item.category !== "road_reopening" && SAYS_CLOSED.test(item.text));
  return false;
}
