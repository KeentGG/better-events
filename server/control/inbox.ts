import { asc, desc, eq } from "drizzle-orm";
import type { InboxItem, ItemStatus, SourceTier } from "../../src/lib/types";
import type { Db } from "../db/client";
import { areas, collectors, items, rawPosts, sources, staff } from "../db/schema";
import { runFetcher } from "../ingest/fetchers";
import type { Actor } from "../items/actions";

const INBOX_LIMIT = 100;

/** GET /api/control/inbox: items in one status, with the original post and who sent it in. */
export async function buildInbox(db: Db, status: ItemStatus): Promise<InboxItem[]> {
  const rows = await db
    .select({ item: items, source: sources, area: areas.name, post: rawPosts, collector: collectors.name, addedBy: staff.name })
    .from(items)
    .leftJoin(sources, eq(items.sourceId, sources.id))
    .leftJoin(areas, eq(items.areaId, areas.id))
    .leftJoin(rawPosts, eq(items.rawPostId, rawPosts.id))
    .leftJoin(collectors, eq(rawPosts.collectorId, collectors.id))
    .leftJoin(staff, eq(rawPosts.staffId, staff.id))
    .where(eq(items.status, status))
    // Oldest first while reviewing, so nothing waits too long; newest first otherwise.
    .orderBy(status === "needs_review" ? asc(items.createdAt) : desc(items.publishedAt))
    .limit(INBOX_LIMIT);

  return rows.map(({ item, source, area, post, collector, addedBy }) => ({
    id: item.id,
    status: item.status,
    category: item.category,
    title: item.title,
    body: item.body,
    area,
    confidence: item.confidence,
    publishedAt: item.publishedAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
    source: source ? { name: source.name, tier: source.tier as SourceTier } : null,
    post: post ? { platform: post.platform, url: post.url, author: post.author, text: post.text, collector, addedBy } : null,
  }));
}

/**
 * POST /api/control/posts: a curator pastes a post by hand. It is stored as a raw post, attributed to
 * the staff member, and classified straight away like any other.
 */
export async function addCuratedPost(db: Db, post: { sourceId?: string; url?: string; text: string; postedAt?: string }, actor: Actor) {
  const [row] = await db
    .insert(rawPosts)
    .values({
      sourceId: post.sourceId,
      staffId: actor.kind === "staff" ? actor.id : null,
      platform: "curator",
      externalId: crypto.randomUUID(),
      url: post.url,
      text: post.text,
      postedAt: post.postedAt ? new Date(post.postedAt) : new Date(),
    })
    .returning({ id: rawPosts.id });
  // Logged as a classifier run; a failure leaves the post for the next pass.
  await runFetcher(db, "classifier");
  return row;
}
