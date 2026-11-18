import { sql } from "drizzle-orm";
import type {
  ControlActivity,
  ControlBoard,
  ControlCollector,
  ControlFetcher,
  ControlFetcherStatus,
  ControlGroup,
  ControlIntake,
  ControlSources,
} from "../../src/lib/types";
import type { Db } from "../db/client";
import { collectors } from "../db/schema";
import type { Viewer } from "../shared";
import { ACTIVITY_LINES, FETCHERS, GROUPS, groupOfCategory, type FetcherKey } from "./config";
import { FEEDS, type FeedKey } from "./feeds";
import { streamHealth, type Run } from "./health";
import { checkedLine, laneIsStale } from "./lanes";
import { loadGroups } from "./stale-windows";

const MINUTE = 60_000;

// Raw queries return timestamps as driver-formatted strings, so they select epoch milliseconds instead.
const epochMs = (expression: string) => sql.raw(`(extract(epoch from ${expression}) * 1000)::float8`);
const toIso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

const isFetcher = (key: string): key is FetcherKey => Object.hasOwn(FETCHERS, key);
const fetcherLabel = (fetcher: FetcherKey, sourceName: string | null) => FETCHERS[fetcher].label + (sourceName ? ` (${sourceName})` : "");

const latest = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

// ── Fetcher health ──────────────────────────────────────────────────────────

interface Stream extends ControlFetcherStatus {
  fetcher: FetcherKey;
  sourceId: string | null;
  sourceName: string | null;
}

/** Health of every fetcher × source that has ever logged a run (inactive sources are skipped). */
async function loadStreams(db: Db, now: Date): Promise<Stream[]> {
  const recent = await db.execute<{
    fetcher: string;
    source_id: string | null;
    source_name: string | null;
    status: Run["status"];
    started_at: number;
    error: string | null;
  }>(sql`
    select r.fetcher, r.source_id, s.name as source_name, r.status, ${epochMs("r.started_at")} as started_at, r.error
    from (
      select *, row_number() over (partition by fetcher, source_id order by started_at desc) as rn from ingest_runs
    ) r
    left join sources s on s.id = r.source_id
    where r.rn <= 10 and (s.id is null or s.active)
    order by r.started_at desc`);
  const stats = await db.execute<{ fetcher: string; source_id: string | null; last_ok_at: number | null; errors_24h: number; posts_24h: number }>(sql`
    select fetcher, source_id,
      ${epochMs("max(started_at) filter (where status = 'ok')")} as last_ok_at,
      (count(*) filter (where status = 'error' and started_at > now() - interval '24 hours'))::int as errors_24h,
      coalesce(sum(posts_in) filter (where started_at > now() - interval '24 hours'), 0)::int as posts_24h
    from ingest_runs group by fetcher, source_id`);

  const streamKey = (r: { fetcher: string; source_id: string | null }) => `${r.fetcher}|${r.source_id ?? ""}`;
  const byStream = new Map<string, (typeof recent)[number][]>();
  for (const r of recent) {
    if (!isFetcher(r.fetcher)) continue;
    const k = streamKey(r);
    if (!byStream.has(k)) byStream.set(k, []);
    byStream.get(k)!.push(r);
  }

  return [...byStream.entries()].map(([k, runs]) => {
    const fetcher = runs[0].fetcher as FetcherKey;
    const stat = stats.find((s) => streamKey(s) === k);
    const health = streamHealth(
      runs.map((r) => ({ status: r.status, startedAt: new Date(r.started_at), error: r.error })),
      FETCHERS[fetcher].intervalMinutes,
      now,
    );
    return {
      fetcher,
      sourceId: runs[0].source_id,
      sourceName: runs[0].source_name,
      ...health,
      lastOkAt: toIso(stat?.last_ok_at ?? null),
      errors24h: stat?.errors_24h ?? 0,
      postsIn24h: stat?.posts_24h ?? 0,
    } satisfies Stream;
  });
}

function combine(streams: Stream[]): ControlFetcherStatus {
  const red = streams.filter((s) => s.health === "red");
  const newestFirst = [...streams].sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""));
  return {
    health: red.length ? "red" : streams.some((s) => s.health === "green") ? "green" : "idle",
    problem: red.length === 1 ? red[0].problem : red.length ? `${red.length} sources failing` : null,
    lastRunAt: streams.reduce<string | null>((m, s) => latest(m, s.lastRunAt), null),
    lastOkAt: streams.reduce<string | null>((m, s) => latest(m, s.lastOkAt), null),
    lastError: newestFirst.find((s) => s.lastError)?.lastError ?? null,
    failedInRow: Math.max(0, ...streams.map((s) => s.failedInRow)),
    errors24h: streams.reduce((n, s) => n + s.errors24h, 0),
    postsIn24h: streams.reduce((n, s) => n + s.postsIn24h, 0),
  };
}

// ── Board loaders ───────────────────────────────────────────────────────────

/** Last few published items per category; the first row is the category's latest update. */
function loadRecentItems(db: Db) {
  return db.execute<{ category: string; title: string; at: number }>(sql`
    select category::text as category, title, ${epochMs("published_at")} as at
    from (
      select category, title, published_at,
        row_number() over (partition by category order by published_at desc) as rn
      from items where status = 'published' and published_at <= now()
    ) i
    where rn <= ${ACTIVITY_LINES}`);
}

/** Last few failed runs per fetcher in the past 24h, shown as error lines on the tiles. */
function loadRecentErrors(db: Db) {
  return db.execute<{ fetcher: string; source_name: string | null; at: number; error: string | null }>(sql`
    select r.fetcher, s.name as source_name, ${epochMs("coalesce(r.finished_at, r.started_at)")} as at, r.error
    from (
      select *, row_number() over (partition by fetcher order by started_at desc) as rn
      from ingest_runs where status = 'error' and started_at > now() - interval '24 hours'
    ) r
    left join sources s on s.id = r.source_id
    where r.rn <= ${ACTIVITY_LINES}`);
}

/** Newest rows of every extra feed the groups list, keyed by feed. */
async function loadFeeds(db: Db) {
  const keys = [...new Set(GROUPS.flatMap((g) => g.feeds))];
  const rows = await Promise.all(keys.map((k) => db.execute<{ at: number; text: string }>(sql`select ${epochMs("at")} as at, text from (${FEEDS[k]}) feed`)));
  return new Map<FeedKey, { at: number; text: string }[]>(keys.map((k, i) => [k, [...rows[i]]]));
}

/**
 * Posts from the last 24h in three buckets, by the category of the item they became (null when none).
 * Groups and the summary add up the same rows, so the buckets mean the same thing everywhere;
 * dropped posts with no item have no category and only count in the summary.
 */
export function loadIntake(db: Db) {
  return db.execute<{ category: string | null; in: number; used: number; pending: number; dropped: number }>(sql`
    select i.category::text as category, count(*)::int as "in",
      (count(*) filter (where i.status = 'published'))::int as used,
      (count(*) filter (where i.status = 'needs_review' or (i.id is null and r.outcome is null)))::int as pending,
      (count(*) filter (where i.status = 'hidden' or (i.id is null and r.outcome = 'ignored')))::int as dropped
    from raw_posts r left join items i on i.raw_post_id = r.id
    where r.created_at > now() - interval '24 hours'
    group by 1`);
}

export const sumIntake = (rows: ControlIntake[]): ControlIntake => ({
  in: rows.reduce((n, r) => n + r.in, 0),
  used: rows.reduce((n, r) => n + r.used, 0),
  pending: rows.reduce((n, r) => n + r.pending, 0),
  dropped: rows.reduce((n, r) => n + r.dropped, 0),
});

/** Newest "nothing new" checks per lane. A future one is dropped in the tile, not here: Node and Postgres clocks differ by a little. */
function loadLaneChecks(db: Db) {
  return db.execute<{ lane: string; note: string | null; sources: string[] | null; at: number }>(sql`
    select lane, note, sources, ${epochMs("checked_at")} as at
    from (
      select lane, note, sources, checked_at,
        row_number() over (partition by lane order by checked_at desc) as rn
      from lane_checks
    ) c
    where rn <= ${ACTIVITY_LINES}`);
}

/** Newest edit of a published item per category. Editing does not move `published_at`, so the feed stays put. */
function loadRecentEdits(db: Db) {
  return db.execute<{ category: string; title: string; at: number }>(sql`
    select category, title, at from (
      select i.category::text as category, i.title, ${epochMs("a.created_at")} as at,
        row_number() over (partition by i.category order by a.created_at desc) as rn
      from item_actions a
      join items i on i.id = a.item_id
      where a.action = 'edit' and i.status = 'published'
    ) e where rn = 1`);
}

/**
 * Newest desk topic change per category, when it landed after the item was published. Topics set in
 * the same write as the post sit within a couple of seconds of `published_at` and are not a later edit.
 */
function loadRecentTopicEdits(db: Db) {
  return db.execute<{ category: string; title: string; at: number }>(sql`
    select category, title, at from (
      select i.category::text as category, i.title, ${epochMs("et.created_at")} as at,
        row_number() over (partition by i.category order by et.created_at desc) as rn
      from entity_topics et
      join items i on i.id = et.entity_id
      where et.entity_type = 'item' and et.source = 'desk' and i.status = 'published'
        and et.created_at > i.published_at + interval '2 seconds'
    ) t where rn = 1`);
}

/** Open flags per category, on items that are still up (a hidden item's flag no longer matters). */
function loadFlags(db: Db) {
  return db.execute<{ category: string; flags: number }>(sql`
    select category::text as category, count(*)::int as flags
    from items where flag is not null and status <> 'hidden'
    group by 1`);
}

/** Visitor suggestions waiting on the team desk; they never reach the intake table until approved. */
async function loadSuggestions(db: Db) {
  const [row] = await db.execute<{ n: number }>(sql`select count(*)::int as n from submissions where status = 'pending'`);
  return row?.n ?? 0;
}

// ── GET /api/control/board ──────────────────────────────────────────────────

/** The wall. Team members get it without flags (`viewer.moderator` false), so the flag query is skipped. */
export async function buildBoard(db: Db, viewer: Viewer, now = new Date()): Promise<ControlBoard> {
  const [groups, streams, itemRows, errorRows, feeds, intakeRows, flagRows, checkRows, editRows, topicRows, suggestions] = await Promise.all([
    loadGroups(db),
    loadStreams(db, now),
    loadRecentItems(db),
    loadRecentErrors(db),
    loadFeeds(db),
    loadIntake(db),
    viewer.moderator ? loadFlags(db) : null,
    loadLaneChecks(db),
    loadRecentEdits(db),
    loadRecentTopicEdits(db),
    loadSuggestions(db),
  ]);

  const out: ControlGroup[] = groups.map((g) => {
    const inGroup = (category: string) => groupOfCategory(category) === g.key;
    const updates: ControlActivity[] = [
      ...itemRows.filter((r) => inGroup(r.category)).map((r) => ({ at: toIso(r.at)!, kind: "item" as const, text: r.title })),
      ...g.feeds.flatMap((f) => (feeds.get(f) ?? []).map((r) => ({ at: toIso(r.at)!, kind: "update" as const, text: r.text }))),
      ...checkRows
        .filter((r) => r.lane === g.key && r.at <= now.getTime() + 1000)
        .map((r) => ({ at: toIso(r.at)!, kind: "update" as const, text: checkedLine(r.note, Array.isArray(r.sources) ? r.sources : []) })),
      ...editRows.filter((r) => inGroup(r.category)).map((r) => ({ at: toIso(r.at)!, kind: "update" as const, text: `Edited: ${r.title}` })),
      ...topicRows.filter((r) => inGroup(r.category)).map((r) => ({ at: toIso(r.at)!, kind: "update" as const, text: `Topics updated: ${r.title}` })),
    ];
    const errors: ControlActivity[] = errorRows
      .filter((r) => isFetcher(r.fetcher) && g.fetchers.includes(r.fetcher))
      .map((r) => ({ at: toIso(r.at)!, kind: "error", text: `${fetcherLabel(r.fetcher as FetcherKey, r.source_name)}: ${r.error ?? "failed"}` }));

    // Errors show on the tile but never count as an update.
    const lastUpdateAt = updates.reduce<string | null>((m, a) => latest(m, a.at), null);
    const problems = streams
      .filter((s) => g.fetchers.includes(s.fetcher) && s.health === "red")
      .map((s) => `${fetcherLabel(s.fetcher, s.sourceName)}: ${s.problem}`);
    const stale = laneIsStale(lastUpdateAt, g.staleMinutes, now);

    return {
      key: g.key,
      label: g.label,
      health: problems.length ? "red" : stale ? "gray" : "green",
      ...(flagRows && { flags: flagRows.filter((r) => groupOfCategory(r.category) === g.key).reduce((n, r) => n + r.flags, 0) }),
      lastUpdateAt,
      staleMinutes: g.staleMinutes,
      intake: sumIntake(intakeRows.filter((r) => r.category && groupOfCategory(r.category) === g.key)),
      problems,
      activity: [...updates, ...errors].sort((a, b) => b.at.localeCompare(a.at)).slice(0, ACTIVITY_LINES),
      updates: [...g.updates],
      categories: [...g.categories],
      about: g.about ?? null,
    };
  });

  return {
    generatedAt: now.toISOString(),
    summary: {
      broken: out.filter((g) => g.health === "red").length,
      stale: out.filter((g) => g.health === "gray").length,
      ...(flagRows && { flags: flagRows.reduce((n, r) => n + r.flags, 0) }),
      suggestions,
      intake: sumIntake([...intakeRows]),
    },
    groups: out,
  };
}

// ── GET /api/control/sources ────────────────────────────────────────────────

/** A collector counts as active if it pushed posts or wrote on the team desk within this window. */
const COLLECTOR_ACTIVE_MINUTES = 60;

export async function buildSources(db: Db, now = new Date()): Promise<ControlSources> {
  const streams = await loadStreams(db, now);
  const fetchers: ControlFetcher[] = (Object.keys(FETCHERS) as FetcherKey[]).map((key) => {
    const own = streams.filter((s) => s.fetcher === key);
    const perSource = own.filter((s) => s.sourceId);
    return {
      key,
      label: FETCHERS[key].label,
      intervalMinutes: FETCHERS[key].intervalMinutes,
      ...combine(own),
      sources: perSource.map(({ fetcher: _f, sourceId, sourceName, ...status }) => ({ id: sourceId!, name: sourceName ?? "Unknown", ...status })),
    };
  });

  const rows = await db
    .select({
      id: collectors.id,
      name: collectors.name,
      active: collectors.active,
      lastSeenAt: collectors.lastSeenAt,
      // Pushed posts plus desk entries (desk items have no raw post, so nothing is counted twice).
      posts24h: sql<number>`(
        (select count(*) from raw_posts r where r.collector_id = "collectors"."id" and r.created_at > now() - interval '24 hours') +
        (select count(*) from items i where i.collector_id = "collectors"."id" and i.raw_post_id is null and i.created_at > now() - interval '24 hours')
      )::int`,
    })
    .from(collectors)
    .orderBy(sql`${collectors.lastSeenAt} desc nulls last`);
  const collectorsOut: ControlCollector[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    active: c.active,
    health: c.active && c.lastSeenAt && now.getTime() - c.lastSeenAt.getTime() <= COLLECTOR_ACTIVE_MINUTES * MINUTE ? "active" : "idle",
    lastSeenAt: c.lastSeenAt?.toISOString() ?? null,
    posts24h: c.posts24h,
  }));

  return { generatedAt: now.toISOString(), fetchers, collectors: collectorsOut };
}
