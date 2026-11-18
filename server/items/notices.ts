import { and, desc, eq, gte, inArray, isNotNull, isNull, notInArray, or } from "drizzle-orm";
import { z } from "zod";
import { fitHeadline, TITLE_MAX } from "../../src/lib/headline";
import type { Category, NoticeLink } from "../../src/lib/types";
import { findGroup } from "../control/config";
import type { Db } from "../db/client";
import { eventUpdates, items } from "../db/schema";

/** A notice with no end still counts as current for this long after it was posted. */
export const OPEN_ENDED_HOURS = 24;

/** The categories a notice can be resolved in: the Safety tile's, so there is one list. */
export const resolvableCategories = (): readonly Category[] => findGroup("safety")?.categories ?? [];
export const isResolvable = (category: Category) => resolvableCategories().includes(category);

export const resolveBody = z
  .object({
    outcome: z.enum(["found", "all_clear", "other"]),
    text: z.string().trim().max(140).optional(),
    url: z.url({ protocol: /^https?$/ }).max(500).optional(),
  })
  .refine((r) => r.outcome !== "other" || r.text, { message: "say what happened", path: ["text"] });
export type ResolveBody = z.infer<typeof resolveBody>;

/** The follow-up's headline: "Found: <title>", "All clear: <title>", or the given text; fit to the headline cap. */
export function resolveTitle(outcome: ResolveBody["outcome"], original: string, text?: string, max = TITLE_MAX) {
  const raw = outcome === "other" ? (text ?? "") : `${outcome === "found" ? "Found" : "All clear"}: ${original}`;
  return fitHeadline(raw, "", max);
}

/** Whether an item is current: published, and not past its end (or, with none, posted within the last day). */
export const currentItem = (now: Date) =>
  and(
    eq(items.status, "published"),
    or(gte(items.endsAt, now), and(isNull(items.endsAt), gte(items.publishedAt, new Date(now.getTime() - OPEN_ENDED_HOURS * 3_600_000)))),
  );

/**
 * Current notices linked to places or events, newest first, at most `limit` each, in two queries for any
 * number of owners. Items an event's own change or winners post made are left out; they arrive through event_updates.
 */
export async function noticesFor(db: Db, by: "place" | "event", ids: string[], limit: number, now = new Date()) {
  const found = new Map<string, NoticeLink[]>();
  if (!ids.length) return found;
  const column = by === "place" ? items.placeId : items.eventId;
  const rows = await db
    .select({ id: items.id, owner: column, title: items.title, category: items.category, startsAt: items.startsAt, endsAt: items.endsAt })
    .from(items)
    .where(and(inArray(column, ids), currentItem(now), by === "event" ? notInArray(items.id, db.select({ id: eventUpdates.itemId }).from(eventUpdates).where(isNotNull(eventUpdates.itemId))) : undefined))
    .orderBy(desc(items.publishedAt));
  for (const r of rows) {
    const list = found.get(r.owner!) ?? [];
    if (list.length < limit) found.set(r.owner!, [...list, { id: r.id, title: r.title, category: r.category, startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null }]);
  }
  return found;
}

/** Of these items, the ones a published follow-up in a resolvable category has resolved. */
export async function resolvedAmong(db: Db, itemIds: string[]) {
  if (!itemIds.length) return new Set<string>();
  const rows = await db
    .select({ parent: items.parentItemId })
    .from(items)
    .where(and(inArray(items.parentItemId, itemIds), eq(items.status, "published"), inArray(items.category, [...resolvableCategories()])));
  return new Set(rows.flatMap((r) => (r.parent ? [r.parent] : [])));
}


/** Why this post can't be resolved by this person, or null. Mirrors hide and end: team members only their own. */
export function resolveProblem(
  item: { category: Category; status: string; collectorId: string | null },
  resolved: boolean,
  author: { kind: "staff" | "collector"; id: string },
): { error: string; status: 400 | 403 | 409 } | null {
  if (author.kind === "collector" && item.collectorId !== author.id) return { error: "Team members can only change their own desk entries.", status: 403 };
  if (!isResolvable(item.category)) return { error: "Only safety posts can be resolved.", status: 400 };
  if (item.status === "hidden") return { error: "This item changed since you loaded it. Reload and try again.", status: 409 };
  if (resolved) return { error: "That post is already resolved.", status: 409 };
  return null;
}
