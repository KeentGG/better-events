import { and, asc, eq, sql } from "drizzle-orm";
import type { TopicSuggestion } from "../src/lib/topicMatch";
import type { TopicNode } from "../src/lib/types";
import type { Db } from "./db/client";
import { entityTopics, topics } from "./db/schema";

export type TopicEntity = "item" | "event" | "place";

/** How far ahead an event, and how far back an item, counts as on today for a topic. */
export const LIVE_HOURS = 24;

/**
 * SQL for the nights of a daily event `e` that aren't called off and aren't over yet (plus an extra condition):
 * a repeating event counts as coming while any night remains.
 */
const nights = (extra: string) => `select 1 from generate_series(0, e.repeat_until - (e.planned_start at time zone 'Asia/Manila')::date) as n(k)
  where ((e.planned_start at time zone 'Asia/Manila')::date + n.k) <> all(e.skip_dates)
    and coalesce(e.planned_end, e.planned_start + case when e.all_day or not e.time_known then interval '1 day' else interval '3 hours' end) + n.k * interval '1 day' >= now() ${extra}`;

/** Effective topic keys per entity id (its own, and for an item those of its linked event and place). */
export async function topicsOf(db: Db, type: TopicEntity, ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (ids.length === 0) return out;
  const rows = await db.execute<{ entity_id: string; topic_key: string }>(
    sql`select entity_id, topic_key from entity_effective_topics where entity_type = ${type} and entity_id in ${ids} order by topic_key`,
  );
  for (const r of rows) out.set(r.entity_id, [...(out.get(r.entity_id) ?? []), r.topic_key]);
  return out;
}

/**
 * Visible topics as a tree, each with what a visitor would get by following it: `count` is the events
 * still to come (not cancelled, not over) plus published items from the last day that have not ended,
 * `today` is the part of that on now or starting within the day, and `places` is its active places.
 * A root counts its own and its children's, each thing once.
 */
export async function topicTree(db: Db): Promise<TopicNode[]> {
  const rows = await db.select().from(topics).orderBy(asc(topics.order), asc(topics.name));
  const counts = await db.execute<{ key: string; n: number; today: number; places: number }>(sql`
    with live as (
      select 'item' as entity_type, id as entity_id, true as soon from items
        where status = 'published' and published_at >= now() - make_interval(hours => ${LIVE_HOURS})
          and (ends_at is null or ends_at >= now())
      union all
      select 'event', e.id,
        case when e.repeat_until is null then e.planned_start <= now() + make_interval(hours => ${LIVE_HOURS})
        else exists (${sql.raw(nights("and e.planned_start + n.k * interval '1 day' <= now() + make_interval(hours => " + LIVE_HOURS + ")"))}) end
      from events e
        where e.status <> 'cancelled'
          and case when e.repeat_until is null
            then coalesce(e.actual_end, e.planned_end, e.planned_start + case when e.all_day or not e.time_known then interval '1 day' else interval '3 hours' end) >= now()
            else exists (${sql.raw(nights(""))}) end
      union all
      select 'place', id, false from places where active and archived_at is null
    ),
    tagged as (
      select distinct t.key, e.entity_type, e.entity_id, live.soon
      from entity_effective_topics e
      join live using (entity_type, entity_id)
      join topics c on c.key = e.topic_key
      join topics t on t.key = c.key or t.key = c.parent_key
    )
    select key,
      (count(*) filter (where entity_type <> 'place'))::int as n,
      (count(*) filter (where entity_type <> 'place' and soon))::int as today,
      (count(*) filter (where entity_type = 'place'))::int as places
    from tagged group by key`);
  const n = new Map(counts.map((r) => [r.key, r]));
  const node = (t: (typeof rows)[number]): TopicNode => ({
    key: t.key,
    name: t.name,
    icon: t.icon,
    aliases: t.aliases,
    count: n.get(t.key)?.n ?? 0,
    today: n.get(t.key)?.today ?? 0,
    places: n.get(t.key)?.places ?? 0,
    children: [],
  });
  const visible = rows.filter((t) => !t.hidden);
  const roots = visible.filter((t) => !t.parentKey).map(node);
  for (const t of visible) if (t.parentKey) roots.find((r) => r.key === t.parentKey)?.children.push(node(t));
  return roots;
}

/** Every topic key, hidden ones included, for checking what a form sent. */
export async function topicKeys(db: Pick<Db, "select">): Promise<Set<string>> {
  return new Set((await db.select({ key: topics.key }).from(topics)).map((t) => t.key));
}

/**
 * Replaces an entity's topics with `keys`, as entered on the desk by `by`. The classifier's guesses go
 * too: a person has now said what it is about.
 */
export async function setDeskTopics(db: Pick<Db, "delete" | "insert">, type: TopicEntity, id: string, keys: readonly string[], by: { collectorId: string | null; staffId: string | null }) {
  await db.delete(entityTopics).where(and(eq(entityTopics.entityType, type), eq(entityTopics.entityId, id)));
  if (keys.length === 0) return;
  await db
    .insert(entityTopics)
    .values([...new Set(keys)].map((topicKey) => ({ entityType: type, entityId: id, topicKey, source: "desk", createdByCollectorId: by.collectorId, createdByStaffId: by.staffId })))
    .onConflictDoNothing();
}

/** Records the classifier's topic guesses for an item, leaving any the desk set alone. */
export async function addClassifierTopics(db: Pick<Db, "insert">, itemId: string, suggestions: readonly TopicSuggestion[]) {
  if (suggestions.length === 0) return;
  await db
    .insert(entityTopics)
    .values(suggestions.map((s) => ({ entityType: "item", entityId: itemId, topicKey: s.key, source: "classifier", confidence: s.confidence })))
    .onConflictDoNothing();
}

/** Own topic keys (not inherited) per entity id, for prefilling the desk's picker. */
export async function ownTopics(db: Pick<Db, "select">, type: TopicEntity, ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ id: entityTopics.entityId, key: entityTopics.topicKey })
    .from(entityTopics)
    .where(and(eq(entityTopics.entityType, type), sql`${entityTopics.entityId} in ${ids}`))
    .orderBy(asc(entityTopics.topicKey));
  for (const r of rows) out.set(r.id, [...(out.get(r.id) ?? []), r.key]);
  return out;
}
