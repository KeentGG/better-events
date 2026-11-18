import { and, eq, gt, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { Db } from "../db/client";
import { fitHeadline } from "../../src/lib/headline";
import { suggestTopics } from "../../src/lib/topicMatch";
import { areas, items, rawPosts, sources, topics } from "../db/schema";
import { addClassifierTopics } from "../topics";
import { classify, mentionedArea } from "./classify";
import { claimedCategory, CONFLICT_WINDOW_HOURS, findConflict, flagFor, type OfficialUpdate } from "./flags";

/**
 * Turns unclassified raw posts into feed items and records each post's outcome (used or ignored). Runs in the cron pass and right after a
 * post is submitted, so the team sees it in the feed or the curator inbox straight away. Runs can overlap: a post is only handled by the
 * run whose write lands first (the unique item per raw post), and the result counts only the posts this run handled.
 */
export async function classifyPending(db: Db, limit = 200) {
  const pending = await db
    .select({ post: rawPosts, tier: sources.tier })
    .from(rawPosts)
    .leftJoin(sources, eq(rawPosts.sourceId, sources.id))
    .where(isNull(rawPosts.classifiedAt))
    .limit(limit);
  if (!pending.length) return 0;
  const areaRows = await db.select().from(areas);
  const topicRows = await db.select().from(topics);
  const now = new Date();
  const official = await recentOfficialRoadUpdates(db, now);

  let handled = 0;
  for (const { post, tier } of pending) {
    const c = classify(post.text);
    // Official pages, curators and team members vouch for a post; automated fetchers do not.
    const trusted = (tier ?? 4) <= 2 || post.platform === "curator" || post.collectorId !== null;

    // Nothing matched and nobody vouches for it: count it as ignored instead of filling the inbox.
    if (c.category === "other" && !trusted) {
      const ignored = await db
        .update(rawPosts)
        .set({ classifiedAt: new Date(), outcome: "ignored", outcomeReason: "irrelevant" })
        .where(and(eq(rawPosts.id, post.id), isNull(rawPosts.classifiedAt)))
        .returning({ id: rawPosts.id });
      handled += ignored.length;
      continue;
    }

    const [firstLine, ...rest] = post.text.trim().split("\n");
    // The gazetteer knows the usual spellings; areas the team added are matched by name.
    const areaId = (areaRows.find((a) => a.name === c.area) ?? mentionedArea(post.text, areaRows))?.id ?? null;
    // Curators are staff pasting a post themselves, so their items are not flagged (§4.2).
    const candidate = { category: c.category, confidence: c.confidence, areaId, text: post.text, official: (tier ?? 4) <= 2 };
    const flag = post.platform === "curator" ? null : flagFor(candidate, official, now);
    const category = flag === "conflict" ? claimedCategory(candidate, official, now) : c.category;
    const conflict = flag === "conflict" ? findConflict(candidate, official, now) : undefined;
    const inserted = await db
      .insert(items)
      .values({
        rawPostId: post.id,
        sourceId: post.sourceId,
        category,
        // A long first line keeps its overflow in the body instead of being cut off.
        ...(({ title, body }) => ({ title, body: body.slice(0, 1000) }))(fitHeadline(firstLine, rest.join("\n"))),
        areaId,
        confidence: c.confidence,
        // Official and authority sources publish straight away; everything else unsure goes to review.
        status: (tier ?? 4) <= 2 || c.confidence >= 0.8 ? "published" : "needs_review",
        publishedAt: post.postedAt,
        flag,
        flaggedAt: flag && now,
        conflictItemId: conflict?.id,
      })
      .onConflictDoNothing()
      .returning({ id: items.id });
    // Another run already turned this post into an item and records its outcome.
    if (!inserted.length) continue;
    // Guessed topics; unsure ones put the item under To verify until staff fix them.
    await addClassifierTopics(db, inserted[0].id, suggestTopics(post.text, topicRows));
    await db.update(rawPosts).set({ classifiedAt: new Date(), outcome: "used" }).where(eq(rawPosts.id, post.id));
    handled++;
  }
  return handled;
}

/** Official closures and reopenings from the last few hours, which crowd posts are checked against. */
async function recentOfficialRoadUpdates(db: Db, now: Date): Promise<OfficialUpdate[]> {
  const rows = await db
    .select({ id: items.id, category: items.category, areaId: items.areaId, endsAt: items.endsAt })
    .from(items)
    .innerJoin(sources, eq(items.sourceId, sources.id))
    .where(
      and(
        lte(sources.tier, 2),
        eq(items.status, "published"),
        inArray(items.category, ["road_closure", "road_reopening"]),
        isNotNull(items.areaId),
        gt(items.publishedAt, new Date(now.getTime() - CONFLICT_WINDOW_HOURS * 3_600_000)),
      ),
    );
  return rows.map((r) => ({ id: r.id, category: r.category, areaId: r.areaId!, endsAt: r.endsAt }));
}
