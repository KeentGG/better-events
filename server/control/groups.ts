import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Category, ControlGroupDetail, ControlItem, ControlItemHistory } from "../../src/lib/types";
import type { Db } from "../db/client";
import { areas, collectors, itemActions, items, rawPosts, sources, staff } from "../db/schema";
import { buildBoard, buildSources } from "./board";
import { findGroup } from "./config";

/** How many items the slide-over lists. */
const DETAIL_ITEMS = 40;

// ── GET /api/control/groups/:key ────────────────────────────────────────────

export async function buildGroupDetail(db: Db, key: string, now = new Date()): Promise<ControlGroupDetail | null> {
  const config = findGroup(key);
  if (!config) return null;

  // Staff only (the route is under moderation), so the board is built with flags.
  const [board, sources_, itemsOut] = await Promise.all([buildBoard(db, { moderator: true, self: null }, now), buildSources(db, now), loadItems(db, config.categories)]);
  const group = board.groups.find((g) => g.key === key)!;

  return {
    ...group,
    generatedAt: now.toISOString(),
    fetchers: sources_.fetchers
      .filter((f) => config.fetchers.some((key) => key === f.key))
      .map(({ key, label, health, problem, failedInRow, lastError }) => ({ key, label, health, problem, failedInRow, lastError })),
    items: itemsOut,
    editor: config.editor ?? null,
  };
}

/** The staff member who entered a desk item, as opposed to the one who verified it. */
const enteredBy = alias(staff, "entered_by");
/** The official item a conflict contradicted. */
const contradicted = alias(items, "contradicted");

async function loadItems(db: Db, categories: readonly Category[]): Promise<ControlItem[]> {
  if (!categories.length) return [];
  const rows = await db
    .select({
      item: items,
      area: areas.name,
      source: { name: sources.name, tier: sources.tier },
      // Desk entries carry whoever entered them; classified posts carry whoever sent the post in.
      by: sql<string | null>`coalesce(${collectors.name}, ${enteredBy.name}, (select c.name from collectors c where c.id = ${rawPosts.collectorId}))`,
      verifiedBy: staff.name,
      conflict: { id: contradicted.id, title: contradicted.title },
    })
    .from(items)
    .leftJoin(areas, eq(items.areaId, areas.id))
    .leftJoin(sources, eq(items.sourceId, sources.id))
    .leftJoin(collectors, eq(items.collectorId, collectors.id))
    .leftJoin(enteredBy, eq(items.staffId, enteredBy.id))
    .leftJoin(rawPosts, eq(items.rawPostId, rawPosts.id))
    .leftJoin(staff, eq(items.verifiedBy, staff.id))
    .leftJoin(contradicted, eq(items.conflictItemId, contradicted.id))
    .where(inArray(items.category, [...categories]))
    .orderBy(sql`${items.flag} is null`, desc(items.publishedAt))
    .limit(DETAIL_ITEMS);
  if (!rows.length) return [];

  const history = await db
    .select()
    .from(itemActions)
    .where(
      inArray(
        itemActions.itemId,
        rows.map((r) => r.item.id),
      ),
    )
    .orderBy(asc(itemActions.createdAt));

  return rows.map(({ item, area, source, by, verifiedBy, conflict }) => ({
    id: item.id,
    category: item.category,
    title: item.title,
    body: item.body,
    area,
    status: item.status,
    url: item.url,
    publishedAt: item.publishedAt.toISOString(),
    source: source?.name ? { name: source.name, tier: source.tier } : null,
    by,
    confidence: item.confidence,
    flag: item.flag,
    flaggedAt: item.flaggedAt?.toISOString() ?? null,
    conflictsWith: conflict?.id ? { id: conflict.id, title: conflict.title } : null,
    // ADMIN_TOKEN verifies without a staff row, so a verified item may have no name.
    verifiedBy: verifiedBy ?? (item.verifiedAt ? "Admin" : null),
    verifiedAt: item.verifiedAt?.toISOString() ?? null,
    history: history
      .filter((h) => h.itemId === item.id)
      .map(
        (h): ControlItemHistory => ({
          action: h.action,
          by: h.collectorId ? `${h.byName} (team)` : h.byName,
          at: h.createdAt.toISOString(),
          before: h.before as ControlItemHistory["before"],
          after: h.after as ControlItemHistory["after"],
        }),
      ),
  }));
}
