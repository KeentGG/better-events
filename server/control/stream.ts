import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { TOPIC_SURE } from "../../src/lib/topicMatch";
import { matchesIntakeFilter, type ControlPost, type ControlPostOutcome, type ControlStream, type IntakeFilter, type ItemFlag } from "../../src/lib/types";
import type { Db } from "../db/client";
import { areas, collectors, items, rawPosts, sources, staff } from "../db/schema";
import { isDeskEntry } from "../items/desk";
import type { Viewer } from "../shared";
import { loadIntake, sumIntake } from "./board";
import { findGroup, groupOfCategory, type GroupConfig, type GroupKey } from "./config";

/** The item has classifier topics below TOPIC_SURE (fixing them on the desk replaces them). */
const topicsUnsure = sql<boolean>`exists (select 1 from entity_topics et where et.entity_type = 'item' and et.entity_id = ${items.id} and et.source = 'classifier' and et.confidence < ${TOPIC_SURE})`;
const ownTopicKeys = sql<string[] | null>`(select array_agg(et.topic_key order by et.topic_key) from entity_topics et where et.entity_type = 'item' and et.entity_id = ${items.id})`;

/** How many rows the table shows. */
const STREAM_LIMIT = 50;

/** A row of the intake table, with the ids the graph links it by. */
export interface StreamRow {
  post: ControlPost;
  /** Who sent the post in or entered the desk item; null for a post matched to a page with nobody behind it. */
  person: { kind: "collector" | "staff"; id: string; name: string } | null;
  /** The page a post was matched to. Desk entries all publish under the team's own source, which is left out. */
  source: { id: string; name: string; official: boolean } | null;
  areaId: string | null;
  /** The raw post's id; null for desk entries. */
  rawPostId: string | null;
}

export interface StreamQuery {
  filter: IntakeFilter;
  group?: GroupConfig<GroupKey>;
  limit: number;
  viewer: Viewer;
}

/**
 * The rows behind the intake table and the graph (docs/MISSION_CONTROL.md §2.3): raw posts with where
 * each went, and entries made on the team desk, newest first. `verify` lists oldest first, so nothing
 * waits too long. With a `group`, only rows whose item is in one of its categories (posts with no item
 * have none). Team members get rows without flags; asking for `verify` or `flagged` as one is the
 * route's to refuse.
 */
export async function loadStreamRows(db: Db, { filter, group, limit, viewer }: StreamQuery): Promise<StreamRow[]> {
  const inGroup = group ? (group.categories.length ? inArray(items.category, [...group.categories]) : sql`false`) : undefined;
  const received = filter === "verify" ? asc : desc;

  const sender = alias(collectors, "sender");
  const curator = alias(staff, "curator");
  const [posts, desk] = await Promise.all([
    db
      .select({ post: rawPosts, item: items, area: areas.name, source: sources, sender: sender.name, curator: curator.name, unsure: topicsUnsure, topics: ownTopicKeys })
      .from(rawPosts)
      .leftJoin(items, eq(items.rawPostId, rawPosts.id))
      .leftJoin(areas, eq(items.areaId, areas.id))
      .leftJoin(sources, eq(rawPosts.sourceId, sources.id))
      .leftJoin(sender, eq(rawPosts.collectorId, sender.id))
      .leftJoin(curator, eq(rawPosts.staffId, curator.id))
      .where(and(inGroup, filterSql(filter, true)))
      .orderBy(received(rawPosts.createdAt))
      .limit(limit),
    db
      .select({ item: items, area: areas.name, collector: collectors.name, staff: staff.name, unsure: topicsUnsure, topics: ownTopicKeys })
      .from(items)
      .leftJoin(areas, eq(items.areaId, areas.id))
      .leftJoin(collectors, eq(items.collectorId, collectors.id))
      .leftJoin(staff, eq(items.staffId, staff.id))
      .where(and(isDeskEntry, isNull(items.rawPostId), inGroup, filterSql(filter, false)))
      .orderBy(received(items.createdAt))
      .limit(limit),
  ]);

  const itemOf = (item: typeof items.$inferSelect, area: string | null, unsure: boolean, topicKeys: string[] | null) => ({
    id: item.id,
    category: item.category,
    title: item.title,
    area,
    status: item.status,
    ...(viewer.moderator && { flag: item.flag as ItemFlag | null }),
    verifiedAt: item.verifiedAt?.toISOString() ?? null,
    ...(viewer.moderator && { topics: topicKeys ?? [], topicsUnsure: unsure }),
  });

  const rows: StreamRow[] = [
    ...posts.map(({ post, item, area, source, sender: senderName, curator: curatorName, unsure, topics }): StreamRow => {
      const { outcome, reason } = whereItWent(post.outcome, post.outcomeReason, item?.status);
      const person = post.collectorId
        ? { kind: "collector" as const, id: post.collectorId, name: senderName ?? "Unknown" }
        : post.staffId
          ? { kind: "staff" as const, id: post.staffId, name: curatorName ?? "Unknown" }
          : null;
      return {
        post: {
          id: post.id,
          origin: "post",
          receivedAt: post.createdAt.toISOString(),
          platform: post.platform,
          author: post.author,
          text: post.text,
          url: post.url,
          via: post.collectorId
            ? { kind: "team", name: senderName }
            : post.platform === "curator"
              ? { kind: "curator", name: curatorName ?? source?.name ?? null }
              : { kind: "source", name: source?.name ?? null },
          official: source ? source.tier <= 2 : false,
          outcome,
          reason,
          mine: false,
          item: item && itemOf(item, area, unsure, topics),
        },
        person,
        source: source && { id: source.id, name: source.name, official: source.tier <= 2 },
        areaId: item?.areaId ?? null,
        rawPostId: post.id,
      };
    }),
    ...desk.map(({ item, area, collector, staff: staffName, unsure, topics }): StreamRow => {
      const person = item.collectorId
        ? { kind: "collector" as const, id: item.collectorId, name: collector ?? "Unknown" }
        : { kind: "staff" as const, id: item.staffId!, name: staffName ?? "Unknown" };
      const { outcome, reason } = whereItWent(null, null, item.status);
      return {
        post: {
          id: item.id,
          origin: "desk",
          receivedAt: item.createdAt.toISOString(),
          platform: "desk",
          author: null,
          text: [item.title, item.body].filter(Boolean).join("\n"),
          url: item.url,
          via: { kind: person.kind === "collector" ? "team" : "staff", name: person.name },
          official: false,
          outcome,
          reason: item.status === "hidden" ? "Hidden" : reason,
          mine: viewer.self?.kind === person.kind && viewer.self.id === person.id,
          item: itemOf(item, area, unsure, topics),
        },
        person,
        source: null,
        areaId: item.areaId,
        rawPostId: null,
      };
    }),
  ];

  const order = filter === "verify" ? 1 : -1;
  return rows
    .filter((r) => matchesIntakeFilter(r.post, filter))
    .sort((a, b) => order * a.post.receivedAt.localeCompare(b.post.receivedAt))
    .slice(0, limit);
}

/**
 * The SQL side of matchesIntakeFilter, for raw posts (joined to their item, if any) or desk items.
 * Moderators only see flags, but the rows a filter picks are the same whoever asks.
 */
function filterSql(filter: IntakeFilter, post: boolean): SQL {
  const hidden = sql`${items.status} is not distinct from 'hidden'`;
  const ignored = post ? sql`(${items.id} is null and ${rawPosts.outcome} is not distinct from 'ignored')` : sql`false`;
  const flagged = sql`(${items.flag} is not null and ${items.status} <> 'hidden')`;
  switch (filter) {
    case "open":
      return sql`not (${hidden} or ${ignored})`;
    case "verify":
      return sql`(${items.status} = 'needs_review' or ${flagged} or (${items.status} <> 'hidden' and ${topicsUnsure}))`;
    case "flagged":
      return flagged;
    case "published":
      return sql`${items.status} = 'published'`;
    case "dropped":
      return sql`(${hidden} or ${ignored})`;
  }
}

/**
 * GET /api/control/stream?filter=&group=: the intake table, with the 24h intake for the header. The
 * intake counts raw posts only; desk entries are listed but never counted. Null for an unknown group.
 */
export async function buildStream(db: Db, opts: { filter: IntakeFilter; group?: string; viewer: Viewer }, now = new Date()): Promise<ControlStream | null> {
  const group = opts.group === undefined ? undefined : findGroup(opts.group);
  if (opts.group !== undefined && !group) return null;

  const [rows, intakeRows] = await Promise.all([loadStreamRows(db, { filter: opts.filter, group, limit: STREAM_LIMIT, viewer: opts.viewer }), loadIntake(db)]);
  return {
    generatedAt: now.toISOString(),
    intake: sumIntake(intakeRows.filter((r) => !group || (r.category !== null && groupOfCategory(r.category) === group.key))),
    posts: rows.map((r) => r.post),
  };
}

/** A post's bucket (§4.4) and why, in words. */
export function whereItWent(
  outcome: "used" | "ignored" | null,
  reason: string | null,
  itemStatus: "published" | "needs_review" | "hidden" | undefined,
): { outcome: ControlPostOutcome; reason: string | null } {
  if (itemStatus === "published") return { outcome: "used", reason: null };
  if (itemStatus === "needs_review") return { outcome: "pending", reason: "Waiting for review" };
  if (itemStatus === "hidden") return { outcome: "dropped", reason: "Hidden by staff" };
  if (outcome === "ignored") return { outcome: "dropped", reason: `Ignored: ${reason ?? "no reason"}` };
  return { outcome: "pending", reason: "Not classified yet" };
}
