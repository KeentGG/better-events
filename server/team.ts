import { and, asc, desc, eq, inArray, isNull, ne, or, gte, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { topicsProblem } from "../src/lib/topicMatch";
import { manilaMidnight } from "../src/lib/eventPhase";
import { eventWhen } from "../src/lib/time";
import { dailyProblem, onNow } from "../src/lib/dailyWindow";
import { MAX_REPEAT_DAYS, dayStampOf, manilaDay, repeatProblem, repeatWhen } from "../src/lib/occurrences";
import { planEventChange } from "./eventChange";
import { planResults, type PreviousResults } from "./results";
import { fitHeadline, splitNotice, TITLE_MAX } from "../src/lib/headline";
import { CROWD_LEVELS, crowdLabel } from "../src/lib/crowd";
import { CATEGORIES, EVENT_KINDS, GUIDE_ICONS, MAX_EXTRA_VENUES, NOTICE_CATEGORIES, PLACE_ICONS, PROMO_KIND, TRAFFIC_LEVELS, VENUE_ROLES, presenterLine, type Category, type EventVenue, type TeamEvent, type PlaceKind, type TeamPlace, type TeamPlaceKind, type TeamRecent, type TeamTipSection, type TeamTopic, type Tier } from "../src/lib/types";
import type { Db } from "./db/client";
import { areas, collectors, crowdReadings, eventUpdates, eventVenues, events, itemActions, items, laneChecks, placeKinds, places, resultVersions, sources, staff, tipSections, tips, topics, trafficReadings } from "./db/schema";
import { buildBoard } from "./control/board";
import { findGroup, GROUPS } from "./control/config";
import { laneCheckBody, laneIsStale } from "./control/lanes";
import { applyItemActions, ItemActionError, type Actor } from "./items/actions";
import { lowerBanners, needsEnd, needsEndMessage, tierField, tierPicker, tierProblem, withTier } from "./items/announce";
import { isDeskEntry } from "./items/desk";
import { advisoryTitle, closureTitle, dailyAfterRetime, followUpSubject, followUpTitle, isRetimable, planRetime, retitled } from "./items/retime";
import { OPEN_ENDED_HOURS, resolveBody, resolveProblem, resolveTitle, resolvableCategories, resolvedAmong } from "./items/notices";
import { getDb, resolveActor, touch, viewerOf, wrote, type Env } from "./shared";
import { ownTopics, setDeskTopics, topicKeys } from "./topics";

/**
 * The team desk: the monitoring team enters festival data directly (closures, traffic,
 * delays, winners, notices, the schedule and Around places) instead of copying posts.
 * Team members and staff sign in with their own token. Entries publish straight away under
 * the name of whoever entered them, with an optional link to the post they came from.
 */
type Vars = { db: Db; actor: Actor };
const team = new Hono<{ Bindings: Env; Variables: Vars }>();

/** Whoever enters something on the desk. ADMIN_TOKEN can read the desk but not write, since it names nobody. */
type Author = Extract<Actor, { kind: "collector" | "staff" }>;

team.use("*", async (c, next) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  const actor = await resolveActor(database, c.req.header("authorization"), c.env);
  if (!actor) return c.json({ error: "unauthorized" }, 401);
  if (actor.kind === "admin" && c.req.method !== "GET") {
    return c.json({ error: "Sign in with your own token to post, so entries show who made them." }, 403);
  }
  c.set("db", database);
  c.set("actor", actor);
  await next();
  // Desk writes count as team member activity (docs/MISSION_CONTROL.md §4.5); reads and failed writes do not.
  await touch(database, actor, { write: wrote(c.req.method, c.res.status) });
});

/** The signed-in author. Only write routes call it, and the middleware has already refused admin writes. */
function authorOf(actor: Actor): Author {
  if (actor.kind === "admin") throw new Error("admin cannot write on the team desk");
  return actor;
}

/** The desk entry columns for an item: who entered it. */
const enteredBy = (a: Author) => ({ collectorId: a.kind === "collector" ? a.id : null, staffId: a.kind === "staff" ? a.id : null });

/** Who last changed an event or place, and on a new one who added it. */
function authorship(a: Author, created: boolean) {
  const { collectorId, staffId } = enteredBy(a);
  return {
    updatedByCollectorId: collectorId,
    updatedByStaffId: staffId,
    ...(created && { createdByCollectorId: collectorId, createdByStaffId: staffId }),
  };
}

team.get("/me", (c) => {
  const { name, kind } = c.get("actor");
  return c.json({ name, role: kind });
});

/**
 * A sweep found nothing new. Resets that lane's stale clock and shows on the tile, without a feed item.
 * `checkedAt` defaults to now and cannot be in the future, which would hold the lane green past the window.
 */
team.post("/lanes/:lane/checked", async (c) => {
  const key = c.req.param("lane");
  const lane = findGroup(key);
  if (!lane) return c.json({ error: `Unknown lane "${key}".`, lanes: GROUPS.map((g) => g.key) }, 400);

  const text = await c.req.text();
  let raw: unknown = {};
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
  }
  const body = laneCheckBody.safeParse(raw);
  if (!body.success) return c.json({ error: body.error.issues }, 400);

  const checkedAt = body.data.checkedAt ? new Date(body.data.checkedAt) : new Date();
  if (checkedAt.getTime() > Date.now()) return c.json({ error: "checkedAt is in the future." }, 400);

  const db = c.get("db");
  const author = authorOf(c.get("actor"));
  const [row] = await db
    .insert(laneChecks)
    .values({
      lane: lane.key,
      checkedAt,
      note: body.data.note || null,
      sources: body.data.sources ?? [],
      ...enteredBy(author),
      byName: author.name,
    })
    .returning({
      id: laneChecks.id,
      lane: laneChecks.lane,
      checkedAt: laneChecks.checkedAt,
      note: laneChecks.note,
      sources: laneChecks.sources,
      byName: laneChecks.byName,
    });

  const now = new Date();
  const board = await buildBoard(db, viewerOf(author), now);
  const group = board.groups.find((g) => g.key === lane.key)!;
  return c.json({
    id: row.id,
    lane: row.lane,
    checkedAt: row.checkedAt.toISOString(),
    note: row.note,
    sources: row.sources,
    by: row.byName,
    freshness: {
      health: group.health,
      lastUpdateAt: group.lastUpdateAt,
      staleMinutes: group.staleMinutes,
      stale: laneIsStale(group.lastUpdateAt, group.staleMinutes, now),
    },
  });
});

const link = z.url().max(500).optional();
const when = z.iso.datetime({ offset: true });
const note = z.string().trim().max(500).optional();

/** An end has to come after the start, when both are given. */
const endsAfterStart = (u: { startsAt?: string; endsAt?: string }) => !u.startsAt || !u.endsAt || Date.parse(u.endsAt) > Date.parse(u.startsAt);

export const update = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("advisory"),
    areas: z.array(z.string().max(80)).min(1).max(10),
    startsAt: when.optional(),
    endsAt: when.optional(),
    note,
    url: link,
    tier: tierField,
  }).refine(needsEnd, needsEndMessage),
  // startsAt and endsAt schedule a closure; they mean nothing for the other levels.
  z.object({
    type: z.literal("traffic"),
    areas: z.array(z.string().max(80)).min(1).max(10),
    level: z.enum(TRAFFIC_LEVELS),
    /** For a closure: the whole road (the default) or one lane or side. */
    extent: z.enum(["full", "partial"]).optional(),
    /** Which lanes or side, for a partial closure: "northbound lanes", "one lane open". Goes in the body. */
    lanes: z.string().trim().max(120).optional(),
    startsAt: when.optional(),
    endsAt: when.optional(),
    /** A closure's daily hours, as on a notice: closed only between these times each day of the range. */
    dailyFrom: z.number().int().min(0).max(1439).optional(),
    dailyTo: z.number().int().min(0).max(1439).optional(),
    note,
    url: link,
    /** Announces the closure, the reopening or the heavy-traffic entry this makes; lighter levels post nothing to announce. */
    tier: tierField,
  })
    .refine(needsEnd, needsEndMessage)
    .refine((t) => t.level === "closed" || (t.extent === undefined && !t.lanes), { message: "extent and lanes only go with a closure", path: ["extent"] })
    .refine((t) => t.extent === "partial" || !t.lanes, { message: "lanes only go with a partial closure", path: ["lanes"] })
    .refine((t) => t.level === "closed" || (t.dailyFrom === undefined && t.dailyTo === undefined), { message: "daily hours only go with a closure", path: ["dailyFrom"] })
    .superRefine((t, ctx) => {
      const problem = dailyProblem(t.startsAt, t.endsAt, t.dailyFrom, t.dailyTo);
      if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["dailyFrom"] });
    }),
  z.object({
    type: z.literal("crowd"),
    areas: z.array(z.string().max(80)).min(1).max(10),
    level: z.enum(CROWD_LEVELS),
    note: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal("event"),
    eventId: z.uuid(),
    change: z.enum(["retime", "delay", "extend", "early", "move", "tba", "cancel", "venue", "on_time", "started", "ended"]),
    newStart: when.optional(),
    /** The new planned end, for a retime or the older extend and early. */
    newEnd: when.optional(),
    /** A retime of a date-only event that only moves its day: it stays all day or time to follow. */
    keepDateOnly: z.boolean().optional(),
    venue: z.string().trim().min(1).max(120).optional(),
    /** The area the event moves to with a venue change. */
    areaId: z.uuid().optional(),
    /** The same by name, which is what the desk's area picker has. */
    area: z.string().max(80).optional(),
    /** When it actually started or ended, if not just now. */
    at: when.optional(),
    /** For a cancel of a repeating event: the one day (`YYYY-MM-DD`) called off. Left out cancels the rest of the run. */
    day: z.iso.date().optional(),
    note,
    url: link,
    tier: tierField,
    /** When a pin or banner comes down; defaults to the event's planned end. */
    endsAt: when.optional(),
  }),
  z
    .object({
      type: z.literal("winners"),
      eventId: z.uuid().optional(),
      contest: z.string().trim().min(1).max(120),
      places: z
        .array(
          z.union([
            z.string().trim().max(120),
            z.object({
              label: z.string().trim().max(40).optional(),
              name: z.string().trim().min(1).max(120),
              /** Money or a trophy that goes with the place. */
              prize: z.string().trim().max(60).optional(),
            }),
          ]),
        )
        .min(0)
        .max(10),
      /** Left out, it follows the previous version. Pending is never sent: it means no places and a time. */
      stage: z.enum(["standings", "final", "corrected", "revised"]).optional(),
      /** Continues an earlier contest that isn't on the schedule. */
      contestId: z.uuid().optional(),
      pendingUntil: when.optional(),
      /** Prizes, special awards, a judges' remark: shown under the places. */
      note,
      url: link,
      tier: tierField,
      /** When a pin or banner comes down. */
      endsAt: when.optional(),
      topics: z.array(z.string().max(80)).max(8).optional(),
    })
    .refine(needsEnd, needsEndMessage)
    .refine((w) => w.pendingUntil || w.places.some((p) => (typeof p === "string" ? p.length > 0 : true)), {
      message: "needs at least one winner or a pending time",
      path: ["places"],
    }),
  z.object({
    type: z.literal("notice"),
    category: z.enum(NOTICE_CATEGORIES),
    /** The headline and the details under it. */
    title: z.string().trim().min(1).max(TITLE_MAX).optional(),
    body: z.string().trim().max(1000).optional(),
    /** The older one box: its first line is the headline. Used when there's no `title`. */
    text: z.string().trim().min(1).max(1000).optional(),
    area: z.string().max(80).optional(),
    /** The Around place this is about, e.g. the stall a promo is at. */
    placeId: z.uuid().optional(),
    /** The schedule entry this is about ("during the Street Dance"); a cancelled one is fine. */
    eventId: z.uuid().optional(),
    /** When it happens and when it stops applying; the feed drops it once `endsAt` passes. */
    startsAt: when.optional(),
    endsAt: when.optional(),
    /** Daily hours of a range, minutes after midnight in Manila ("every day 5 PM to 2 AM"). Both or neither, and only when the end is on a later day than the start. */
    dailyFrom: z.number().int().min(0).max(1439).optional(),
    dailyTo: z.number().int().min(0).max(1439).optional(),
    url: link,
    /** How loudly to announce it: 0 feed, 1 pinned, 2 hero banner (staff only, checked in the route). */
    tier: tierField,
    /** Topic keys, optional for an item. */
    topics: z.array(z.string().max(80)).max(8).optional(),
  })
    .refine(endsAfterStart, { message: "the end is before the start", path: ["endsAt"] })
    .superRefine((n, ctx) => {
      const problem = dailyProblem(n.startsAt, n.endsAt, n.dailyFrom, n.dailyTo);
      if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["dailyFrom"] });
    })
    .refine(needsEnd, needsEndMessage)
    .refine((n) => n.title || n.text, { message: "a notice needs a headline", path: ["title"] }),
]);

const levelLabel = { clear: "Clear", moderate: "Moderate", heavy: "Heavy", closed: "Closed" } as const;

/** The start and end a closure or advisory carries, as dates. */
const span = (u: { startsAt?: string; endsAt?: string }) => ({ startsAt: u.startsAt ? new Date(u.startsAt) : undefined, endsAt: u.endsAt ? new Date(u.endsAt) : undefined });

team.post("/updates", async (c) => {
  const db = c.get("db");
  const author = authorOf(c.get("actor"));
  const body = update.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const u = body.data;
  // Role first, before any query; the end is checked here too except for an event change, which can default it.
  const refused = tierProblem("tier" in u ? u.tier : undefined, u.type === "event" ? true : "endsAt" in u ? u.endsAt : undefined, author.kind);
  if (refused) return c.json({ error: refused.error }, refused.status);

  const areaRows = await db.select().from(areas);
  const areaId = (name: string | undefined) => (name ? areaRows.find((a) => a.name === name)?.id : undefined);
  const unknown = [...(u.type === "advisory" || u.type === "traffic" || u.type === "crowd" ? u.areas : []), ...(u.type === "notice" ? [u.area] : [])].find(
    (name) => name && !areaId(name),
  );
  if (unknown) return c.json({ error: `unknown area "${unknown}"` }, 400);
  const itemTopics = "topics" in u ? (u.topics ?? []) : [];
  const badTopics = topicsProblem("item", itemTopics, await topicKeys(db));
  if (badTopics) return c.json({ error: badTopics }, 400);

  const now = new Date();
  const sourceId = await teamSource(db);
  const publish = async (
    item: { category: Category; title: string; body?: string; area?: string; placeId?: string; eventId?: string; parentItemId?: string; startsAt?: Date; endsAt?: Date; dailyFrom?: number; dailyTo?: number; url?: string; severity?: number; closureExtent?: "partial" },
    tx: Pick<Db, "insert"> = db,
  ) => {
    const [row] = await tx
      .insert(items)
      .values({
        sourceId,
        ...enteredBy(author),
        category: item.category,
        // A long title moves its overflow into the body rather than losing it; every input caps its own lengths.
        ...fitHeadline(item.title, item.body),
        areaId: areaId(item.area),
        placeId: item.placeId,
        eventId: item.eventId,
        parentItemId: item.parentItemId,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        dailyFrom: item.dailyFrom,
        dailyTo: item.dailyTo,
        closureExtent: item.closureExtent,
        url: item.url,
        severity: item.severity,
        publishedAt: now,
      })
      .returning({ id: items.id });
    return row.id;
  };

  switch (u.type) {
    case "advisory": {
      const { startsAt, endsAt } = span(u);
      const titleFor = (road: string) => advisoryTitle(road, startsAt, endsAt);
      // One item per road so each shows on the map and under that road's name in the feed.
      const severity = tierPicker(u.tier);
      const ids = await withTier(db, u.tier, now, async (tx) => {
        const made: string[] = [];
        for (const area of u.areas) made.push(await publish({ category: "traffic_advisory", title: titleFor(area), body: u.note, area, startsAt, endsAt, url: u.url, severity: severity() }, tx));
        return made;
      });
      return c.json({ ids, title: u.areas.map(titleFor).join("; ") }, 201);
    }

    case "traffic": {
      const roadIds = u.areas.map((a) => areaId(a)!);
      // Closures on these roads that the map shows, or with `scheduled` will show later. One with no end lapses
      // after 12 hours, as the map has it (server/app.ts); a daily closure always has an end, so it never lapses.
      const live = async (scheduled: boolean) =>
        db
          .select({ id: items.id, area: items.areaId, startsAt: items.startsAt, endsAt: items.endsAt, daily: items.dailyFrom, dailyTo: items.dailyTo })
          .from(items)
          .where(
            and(
              eq(items.category, "road_closure"),
              eq(items.status, "published"),
              inArray(items.areaId, roadIds),
              or(isNull(items.endsAt), gte(items.endsAt, now)),
              or(gte(items.endsAt, now), gte(items.publishedAt, new Date(now.getTime() - 12 * 3_600_000))),
              ...(scheduled ? [] : [or(isNull(items.startsAt), lte(items.startsAt, now))]),
            ),
          );
      const ids: string[] = [];
      const severity = tierPicker(u.tier);

      if (u.level === "closed") {
        // A new closure replaces any earlier one on the road, so changing the times never leaves two.
        const earlier = await live(true);
        if (earlier.length) await db.update(items).set({ endsAt: now }).where(inArray(items.id, earlier.map((e) => e.id)));
        const { startsAt, endsAt } = span(u);
        const partial = u.extent === "partial";
        const daily = u.dailyFrom !== undefined && u.dailyTo !== undefined ? { from: u.dailyFrom, to: u.dailyTo } : null;
        const titleFor = (road: string) => closureTitle(road, startsAt, endsAt, u.extent, daily);
        // Which lanes or side comes first in the body, ahead of the team's own details.
        const details = [u.lanes, u.note].filter(Boolean).join(" · ") || undefined;
        await withTier(db, u.tier, now, async (tx) => {
          for (const area of u.areas) ids.push(await publish({ category: "road_closure", title: titleFor(area), body: details, area, startsAt, endsAt, dailyFrom: u.dailyFrom, dailyTo: u.dailyTo, closureExtent: partial ? "partial" : undefined, url: u.url, severity: severity() }, tx));
        });
        return c.json({ ids, title: u.areas.map(titleFor).join("; ") }, 201);
      }

      // Any other level overrides a closure in force, and Clear also cancels one still scheduled.
      // A daily closure outside its hours isn't in force, so a busy-road report by day leaves the night closure alone.
      const inForce = (e: { startsAt: Date | null; endsAt: Date | null; daily: number | null; dailyTo: number | null }) =>
        e.daily == null || onNow({ startsAt: e.startsAt?.toISOString() ?? null, endsAt: e.endsAt?.toISOString() ?? null, dailyFrom: e.daily, dailyTo: e.dailyTo }, now.getTime());
      const ended = (await live(u.level === "clear")).filter((e) => u.level === "clear" || inForce(e));
      if (ended.length) await db.update(items).set({ endsAt: now }).where(inArray(items.id, ended.map((e) => e.id)));
      // Only a closure that was showing needs a "Reopened" entry; cancelling a scheduled one is silent.
      const reopened = new Set<string | null | undefined>(ended.filter((e) => !e.startsAt || e.startsAt <= now).map((e) => e.area));
      // Clear ends the whole run of a daily closure, even from outside its hours, so the Reopened post says so.
      const wasDaily = new Set<string | null | undefined>(ended.filter((e) => e.daily != null).map((e) => e.area));

      // The 30-minute bucket the map reads; a second report in the same bucket replaces the level.
      const bucketStart = new Date(Math.floor(now.getTime() / 1_800_000) * 1_800_000);
      const titles: string[] = [];
      const end = u.tier ? span(u).endsAt : undefined;
      await withTier(db, u.tier, now, async (tx) => {
      for (const area of u.areas) {
        await db
          .insert(trafficReadings)
          .values({ areaId: areaId(area)!, bucketStart, level: u.level, score: TRAFFIC_LEVELS.indexOf(u.level), itemCount: 1, updatedAt: now })
          .onConflictDoUpdate({
            target: [trafficReadings.areaId, trafficReadings.bucketStart],
            set: { level: u.level, score: TRAFFIC_LEVELS.indexOf(u.level), updatedAt: now },
          });
        // Readers who saw the closure need to see it end. Heavy traffic is worth a feed entry too; lighter levels just update the map.
        if (reopened.has(areaId(area))) {
          const title = wasDaily.has(areaId(area)) ? `Reopened: ${area}, daily closure ended` : `Reopened: ${area}`;
          ids.push(await publish({ category: "road_reopening", title, body: u.note, area, endsAt: end, url: u.url, severity: severity() }, tx));
          titles.push(title);
        }
        if (u.level === "heavy") {
          const title = `${levelLabel[u.level]} traffic on ${area}`;
          ids.push(await publish({ category: "traffic_sentiment", title, body: u.note, area, endsAt: end, url: u.url, severity: severity() }, tx));
          titles.push(title);
        }
      }
      });
      return c.json({ ids, title: titles.length ? titles.join("; ") : `${levelLabel[u.level]} traffic on ${u.areas.join(", ")}` }, 201);
    }

    case "crowd": {
      // A reading, not a post: the newest per area counts for 90 minutes (GET /api/crowd).
      await db
        .insert(crowdReadings)
        .values(u.areas.map((area) => ({ areaId: areaId(area)!, level: u.level, note: u.note || null, ...enteredBy(author), createdAt: now })));
      return c.json({ ids: [], title: `${crowdLabel[u.level]}: ${u.areas.join(", ")}` }, 201);
    }

    case "event": {
      const [ev] = await db.select().from(events).where(eq(events.id, u.eventId)).limit(1);
      if (!ev) return c.json({ error: "event not found" }, 404);
      const plan = planEventChange(ev, u, now, areaRows);
      if ("error" in plan) return c.json(plan, 400);
      const { set, title, category, area } = plan;
      if (!plan.publish) {
        // Started and ended only move the schedule: nothing to announce.
        if (u.tier) return c.json({ error: "This change only updates the schedule, so it can't be announced." }, 400);
        await db.update(events).set({ ...set, ...authorship(author, false) }).where(eq(events.id, ev.id));
        await db.insert(eventUpdates).values({ eventId: ev.id, kind: category, note: u.change === "started" ? "Started" : "Ended" });
        return c.json({ ids: [], title }, 201);
      }

      // A pin or banner comes down with the event unless told otherwise, and shows now rather than when the event starts.
      const endsAt = u.tier ? (u.endsAt ? new Date(u.endsAt) : set.plannedEnd ?? ev.plannedEnd ?? undefined) : undefined;
      const refusedEnd = tierProblem(u.tier, endsAt, author.kind);
      if (refusedEnd) return c.json({ error: `${refusedEnd.error} This event has no end time, so pick one.` }, refusedEnd.status);

      await db
        .update(events)
        .set({ ...set, ...authorship(author, false) })
        .where(eq(events.id, ev.id));
      const startsAt = set.plannedStart ?? ev.plannedStart;
      const itemId = await withTier(db, u.tier, now, (tx) => publish({ category, title, body: u.note, area, startsAt: u.tier || ev.repeatUntil ? undefined : startsAt, endsAt, url: u.url, severity: u.tier }, tx));
      await db.insert(eventUpdates).values({ eventId: ev.id, itemId, kind: category, note: set.note !== undefined ? set.note : (u.note ?? null), newStart: set.plannedStart });
      return c.json({ ids: [itemId], title }, 201);
    }

    case "winners": {
      const latest = async (where: ReturnType<typeof eq>) => (await db.select().from(resultVersions).where(where).orderBy(desc(resultVersions.createdAt)).limit(1))[0];
      let previous = u.eventId ? await latest(eq(resultVersions.eventId, u.eventId)) : undefined;
      if (!previous && u.contestId) {
        previous = await latest(eq(resultVersions.contestId, u.contestId));
        if (!previous) return c.json({ error: "That contest has no results posted." }, 400);
      }
      const before: PreviousResults | null = previous ? { contestId: previous.contestId, stage: previous.stage as PreviousResults["stage"], rows: previous.rows } : null;
      const plan = planResults(before, u, now);
      if ("error" in plan) return c.json({ error: plan.error }, 400);
      // The person posting the replacement may not own the earlier card. Hide stays here, not on the desk patch.
      if (previous?.itemId) {
        try {
          await applyItemActions(db, previous.itemId, [{ action: "hide" }], author);
        } catch (err) {
          // Already hidden. A later post still replaces it.
          if (!(err instanceof ItemActionError) || err.status !== 409) throw err;
        }
      }
      // The winners item sits where the picked event was held.
      const [ev] = u.eventId ? await db.select({ areaId: events.areaId, repeatUntil: events.repeatUntil }).from(events).where(eq(events.id, u.eventId)).limit(1) : [];
      const area = ev ? areaRows.find((a) => a.id === ev.areaId)?.name : undefined;
      // A placeholder shouldn't sit in the feed forever if nobody follows it up.
      const endsAt = u.tier ? (u.endsAt ? new Date(u.endsAt) : undefined) : plan.stage === "pending" && u.pendingUntil ? new Date(Date.parse(u.pendingUntil) + 6 * 3_600_000) : undefined;
      const itemId = await withTier(db, u.tier, now, (tx) => publish({ category: "winner", title: plan.title, body: plan.body, area, endsAt, url: u.url, severity: u.tier }, tx));
      await setDeskTopics(db, "item", itemId, itemTopics, enteredBy(author));
      const versionId = crypto.randomUUID();
      await db.insert(resultVersions).values({
        id: versionId,
        contestId: plan.contestId ?? versionId,
        eventId: u.eventId ?? null,
        contest: u.contest,
        stage: plan.stage,
        rows: plan.rows,
        note: u.note ?? null,
        expectedAt: plan.stage === "pending" && u.pendingUntil ? new Date(u.pendingUntil) : null,
        itemId,
        ...enteredBy(author),
        byName: author.name,
      });
      if (u.eventId) {
        // One night's winners don't finish a daily event; the next night still comes.
        if (plan.markDone && !ev?.repeatUntil) {
          await db
            .update(events)
            .set({ status: "done", actualEnd: sql`coalesce(${events.actualEnd}, now())`, ...authorship(author, false) })
            .where(eq(events.id, u.eventId));
        }
        await db.insert(eventUpdates).values({ eventId: u.eventId, itemId, kind: "winner", results: plan.rows });
      }
      return c.json({ ids: [itemId], title: plan.title }, 201);
    }

    case "notice": {
      const { title: first, body } = u.title ? fitHeadline(u.title, u.body) : splitNotice(u.text ?? "");
      let area = u.area;
      if (u.placeId) {
        const [place] = await db.select({ active: places.active, archivedAt: places.archivedAt, area: areas.name }).from(places).leftJoin(areas, eq(places.areaId, areas.id)).where(eq(places.id, u.placeId)).limit(1);
        if (!place?.active || place.archivedAt) return c.json({ error: "That place isn't listed on Around." }, 400);
        area ||= place.area ?? undefined; // the notice sits in the place's area unless one was picked
      }
      if (u.eventId) {
        const [ev] = await db.select({ area: areas.name }).from(events).leftJoin(areas, eq(events.areaId, areas.id)).where(eq(events.id, u.eventId)).limit(1);
        if (!ev) return c.json({ error: "That event isn't on the schedule." }, 400);
        area ||= ev.area ?? undefined; // with no area or place picked, it sits where the event is
      }
      const notice = { category: u.category, title: first, body, area, placeId: u.placeId, eventId: u.eventId, ...span(u), dailyFrom: u.dailyFrom, dailyTo: u.dailyTo, url: u.url, severity: u.tier };
      const itemId = await withTier(db, u.tier, now, (tx) => publish(notice, tx));
      await setDeskTopics(db, "item", itemId, itemTopics, enteredBy(author));
      return c.json({ ids: [itemId], title: first }, 201);
    }
  }
});

/** The latest version of each contest posted in the last 7 days, newest first. The winners form pre-fills from these. */
export async function recentResults(db: Db, now = new Date()) {
  const rows = await db
    .select()
    .from(resultVersions)
    .where(gte(resultVersions.createdAt, new Date(now.getTime() - 7 * 86_400_000)))
    .orderBy(desc(resultVersions.createdAt));
  const seen = new Set<string>();
  return rows
    .filter((r) => !seen.has(r.contestId) && seen.add(r.contestId))
    .map((r) => ({ contestId: r.contestId, eventId: r.eventId, contest: r.contest, stage: r.stage, rows: r.rows, note: r.note, expectedAt: r.expectedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), byName: r.byName }));
}

team.get("/results", async (c) => c.json(await recentResults(c.get("db"))));

// Recent desk entries, newest first, so mistakes are easy to spot and take down. `category` (repeatable)
// narrows it to a tile's categories, so its live list isn't crowded out by other tiles' posts.
team.get("/recent", async (c) => {
  const categories = z.array(z.enum(CATEGORIES)).safeParse(c.req.queries("category") ?? []);
  if (!categories.success) return c.json({ error: categories.error.issues }, 400);
  const actor = c.get("actor");
  const rows = await c
    .get("db")
    .select({ item: items, area: areas.name, by: sql<string | null>`coalesce(${collectors.name}, ${staff.name})`, placeName: places.name, eventTitle: events.title })
    .from(items)
    .leftJoin(areas, eq(items.areaId, areas.id))
    .leftJoin(places, eq(items.placeId, places.id))
    .leftJoin(events, eq(items.eventId, events.id))
    .leftJoin(collectors, eq(items.collectorId, collectors.id))
    .leftJoin(staff, eq(items.staffId, staff.id))
    .where(and(isDeskEntry, categories.data.length ? inArray(items.category, categories.data) : undefined))
    .orderBy(desc(items.createdAt))
    .limit(30);
  const resolved = await resolvedAmong(c.get("db"), rows.map((r) => r.item.id));
  const resolvable = resolvableCategories();
  // An event's own change or winners post is retimed through its event, not here.
  const eventPosts = new Set(
    (await c.get("db").select({ id: eventUpdates.itemId }).from(eventUpdates).where(inArray(eventUpdates.itemId, rows.map((r) => r.item.id)))).flatMap((r) => (r.id ? [r.id] : [])),
  );
  const recent: TeamRecent[] = rows.map(({ item, area, by, placeName, eventTitle }) => ({
    id: item.id,
    category: item.category,
    title: item.title,
    area,
    status: item.status,
    url: item.url,
    by,
    publishedAt: item.publishedAt.toISOString(),
    body: item.body,
    startsAt: item.startsAt?.toISOString() ?? null,
    endsAt: item.endsAt?.toISOString() ?? null,
    verifiedAt: item.verifiedAt?.toISOString() ?? null,
    tier: Math.min(2, Math.max(0, item.severity)) as Tier,
    place: placeName,
    event: eventTitle,
    resolvable: resolvable.includes(item.category),
    resolved: resolved.has(item.id),
    retimable: isRetimable(item.category) && !eventPosts.has(item.id),
    mine: actor.kind === "collector" ? item.collectorId === actor.id : actor.kind === "staff" && item.staffId === actor.id,
  }));
  return c.json(recent);
});

// Take a desk entry down (or put it back), end it now, or fix its headline and details, logged like any other
// item action. Staff can also lower how loudly it's announced (banner to pinned to feed). Curators have the
// full editor in the inbox.
export const itemPatch = z.union([
  z.object({ status: z.enum(["published", "hidden", "ended"]) }),
  z.object({ tier: z.union([z.literal(0), z.literal(1)]) }),
  z.object({
    title: z.string().trim().min(1).max(TITLE_MAX),
    body: z.string().trim().max(1000),
    area: z.string().max(80).nullable(),
  }),
]);

const ownDeskOnly = (author: Author, entry: { collectorId: string | null }) =>
  author.kind === "collector" && entry.collectorId !== author.id;

team.patch("/items/:id", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  const body = itemPatch.safeParse(await c.req.json().catch(() => null));
  if (!id.success) return c.json({ error: "not found" }, 404);
  if (!body.success) return c.json({ error: body.error.issues }, 400);

  const db = c.get("db");
  const author = authorOf(c.get("actor"));
  if ("tier" in body.data) {
    if (author.kind !== "staff") return c.json({ error: "Only staff can change how a post is announced." }, 403);
    const tier = body.data.tier;
    const lowered = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ severity: items.severity })
        .from(items)
        .where(and(eq(items.id, id.data), isDeskEntry))
        .for("update")
        .limit(1);
      if (!row) return null;
      if (tier >= row.severity) return false;
      await tx.update(items).set({ severity: tier }).where(eq(items.id, id.data));
      // No item_action of its own; it's logged as an edit of the tier, with the old and new value.
      await tx
        .insert(itemActions)
        .values({ itemId: id.data, staffId: author.id, byName: author.name, action: "edit", before: { severity: row.severity }, after: { severity: tier } });
      return true;
    });
    if (lowered === null) return c.json({ error: "not found" }, 404);
    if (!lowered) return c.json({ error: "It's already announced at that level or lower. Reload and try again." }, 409);
    return c.json({ id: id.data, tier });
  }

  const [entry] = await db
    .select({ id: items.id, collectorId: items.collectorId })
    .from(items)
    .where(and(eq(items.id, id.data), isDeskEntry))
    .limit(1);
  if (!entry) return c.json({ error: "not found" }, 404);
  if (ownDeskOnly(author, entry)) return c.json({ error: "Team members can only change their own desk entries." }, 403);

  if ("title" in body.data) {
    const { title, body: text, area } = body.data;
    try {
      const row = await applyItemActions(db, entry.id, [{ action: "edit", title, body: text, area }], author);
      if (!row) return c.json({ error: "not found" }, 404);
      return c.json({ id: row.id, title, body: text });
    } catch (err) {
      if (err instanceof ItemActionError) return c.json({ error: err.message }, err.status);
      throw err;
    }
  }

  try {
    const action = body.data.status === "hidden" ? "hide" : body.data.status === "ended" ? "end" : "unhide";
    const row = await applyItemActions(db, entry.id, [{ action }], author);
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ id: row.id, status: row.status });
  } catch (err) {
    if (err instanceof ItemActionError) return c.json({ error: err.message }, err.status);
    throw err;
  }
});

// Resolve a safety post ("found", "all clear"): publishes a short follow-up of the same category, area, place and
// event that points back at it, and ends the original now, so it leaves the feed and the follow-up carries the news.
// Team members may resolve only their own entries, like hide and end.
team.post("/items/:id/resolve", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  const body = resolveBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success) return c.json({ error: "not found" }, 404);
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const author = authorOf(c.get("actor"));
  const now = new Date();

  const made = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ item: items })
      .from(items)
      .where(and(eq(items.id, id.data), isDeskEntry))
      .for("update", { of: items })
      .limit(1);
    if (!row) return { error: "not found", status: 404 as const };
    const original = row.item;
    const problem = resolveProblem(original, (await resolvedAmong(tx as unknown as Db, [original.id])).size > 0, author);
    if (problem) return problem;

    const { title, body: overflow } = resolveTitle(body.data.outcome, original.title, body.data.text);
    const [followUp] = await tx
      .insert(items)
      .values({
        sourceId: original.sourceId,
        ...enteredBy(author),
        category: original.category,
        title,
        body: overflow,
        areaId: original.areaId,
        placeId: original.placeId,
        eventId: original.eventId,
        parentItemId: original.id,
        url: body.data.url,
        publishedAt: now,
      })
      .returning({ id: items.id });
    // A pin or banner comes down with it, logged like the other tier changes.
    if (original.severity > 0) {
      await tx.update(items).set({ severity: 0 }).where(eq(items.id, original.id));
      await tx
        .insert(itemActions)
        .values({ itemId: original.id, ...enteredBy(author), byName: author.name, action: "edit", before: { severity: original.severity }, after: { severity: 0 } });
    }
    return { id: followUp.id, title, endsAt: original.endsAt };
  });
  if ("error" in made) return c.json({ error: made.error }, made.status);

  // End the original through the item-action path so it is logged; one that has already ended needs nothing.
  if (!made.endsAt || made.endsAt > now) {
    try {
      await applyItemActions(db, id.data, [{ action: "end" }], author);
    } catch (err) {
      // Taken down in the same moment; the follow-up still stands.
      if (!(err instanceof ItemActionError) || err.status !== 409) throw err;
    }
  }
  return c.json({ id: made.id, title: made.title, resolved: id.data }, 201);
});

// Change the times of a posted advisory, closure or notice. Updates the post in place (rebuilding an advisory's or
// closure's headline, remembering the times readers first saw) and, unless told not to, posts a short follow-up that
// points back at it. Team members only on their own entries, like end and hide.
export const retimeBody = z
  .object({
    startsAt: when.optional(),
    endsAt: when.nullable().optional(),
    announce: z.boolean().default(true),
    tier: tierField,
    /** When a pinned or banner follow-up comes down; defaults to the post's new end, else a day. */
    pinUntil: when.optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((b) => b.startsAt !== undefined || b.endsAt !== undefined, { message: "give a new start or end", path: ["startsAt"] });

team.post("/items/:id/retime", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  const body = retimeBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success) return c.json({ error: "not found" }, 404);
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const b = body.data;
  const db = c.get("db");
  const author = authorOf(c.get("actor"));
  const now = new Date();

  const made = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ item: items, road: areas.name })
      .from(items)
      .leftJoin(areas, eq(items.areaId, areas.id))
      .where(and(eq(items.id, id.data), isDeskEntry))
      .for("update", { of: items })
      .limit(1);
    if (!row) return { error: "not found", status: 404 as const };
    const { item, road } = row;
    if (author.kind === "collector" && item.collectorId !== author.id) return { error: "Team members can only change their own desk entries.", status: 403 as const };
    const isEventPost = (await tx.select({ id: eventUpdates.id }).from(eventUpdates).where(eq(eventUpdates.itemId, item.id)).limit(1)).length > 0;
    if (!isRetimable(item.category) || isEventPost) return { error: "The times of this kind of post can't be changed here. Change the event instead.", status: 400 as const };
    if (item.status !== "published" || (item.endsAt && item.endsAt <= now)) return { error: "This item changed since you loaded it. Reload and try again.", status: 409 as const };

    const plan = planRetime({ startsAt: item.startsAt, endsAt: item.endsAt }, { startsAt: b.startsAt ? new Date(b.startsAt) : undefined, endsAt: b.endsAt === undefined ? undefined : b.endsAt ? new Date(b.endsAt) : null }, now);
    if ("error" in plan) return { error: plan.error, status: 400 as const };

    // The follow-up ends with the post it is about (a day when that has no end), or at the pin's own end.
    const tier = b.announce ? (b.tier ?? plan.tier) : 0;
    const followEnd = b.pinUntil ? new Date(b.pinUntil) : (plan.endsAt ?? new Date(now.getTime() + OPEN_ENDED_HOURS * 3_600_000));
    if (b.announce) {
      const refused = tierProblem(tier, followEnd, author.kind);
      if (refused) return { error: refused.error, status: refused.status };
    }

    const daily = dailyAfterRetime(item.dailyFrom, item.dailyTo, plan.startsAt, plan.endsAt);
    const dropDaily = item.dailyFrom != null && !daily;
    const title = retitled(item.category, item.title, road, plan.startsAt, plan.endsAt, item.closureExtent, daily);
    const set = {
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      title,
      timeChange: plan.line,
      // Daily hours only make sense on a range that spans days: a retime to a single day drops them.
      ...(dropDaily && { dailyFrom: null, dailyTo: null }),
      // What readers first saw is kept by the first change only.
      ...(item.timeChange === null && { originalStartsAt: item.startsAt, originalEndsAt: item.endsAt }),
    };
    await tx.update(items).set(set).where(eq(items.id, item.id));
    await tx.insert(itemActions).values({
      itemId: item.id,
      ...enteredBy(author),
      byName: author.name,
      action: "retime",
      before: { startsAt: item.startsAt?.toISOString() ?? null, endsAt: item.endsAt?.toISOString() ?? null, title: item.title },
      after: { startsAt: plan.startsAt?.toISOString() ?? null, endsAt: plan.endsAt?.toISOString() ?? null, title, announced: b.announce },
    });
    if (!b.announce) return { id: null, title, line: plan.line };

    const subject = followUpSubject(item.category, item.title, road, item.closureExtent, !!daily);
    const fit = followUpTitle(plan.line, subject, b.note);
    if (tier === 2) await lowerBanners(tx, now);
    const [followUp] = await tx
      .insert(items)
      .values({
        sourceId: item.sourceId,
        ...enteredBy(author),
        category: item.category,
        closureExtent: item.closureExtent,
        ...fit,
        areaId: item.areaId,
        placeId: item.placeId,
        eventId: item.eventId,
        parentItemId: item.id,
        endsAt: followEnd,
        severity: tier,
        publishedAt: now,
      })
      .returning({ id: items.id });
    return { id: followUp.id, title, line: plan.line };
  });
  if ("error" in made) return c.json({ error: made.error }, made.status);
  return c.json({ id: id.data, title: made.title, change: made.line, followUp: made.id }, 200);
});

// Areas: roads and places the team picks from. Anyone on the desk can add one while filling in a form.

const areaBody = z.object({ name: z.string().trim().min(2).max(80) });

// Adds an area, or returns the one that already has this name (or alias) in any case, so "lacson st" finds "Lacson St".
team.post("/areas", async (c) => {
  const body = areaBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const name = body.data.name.replace(/\s+/g, " ");
  const [existing] = await db
    .select({ name: areas.name })
    .from(areas)
    .where(sql`lower(${areas.name}) = lower(${name}) or exists (select 1 from unnest(${areas.aliases}) a where lower(a) = lower(${name}))`)
    .limit(1);
  if (existing) return c.json(existing);
  const [row] = await db.insert(areas).values({ name }).onConflictDoNothing().returning({ name: areas.name });
  return c.json(row ?? { name }, 201);
});

// Schedule

export const eventBody = z.object({
  title: z.string().trim().min(1).max(140),
  kind: z.enum(EVENT_KINDS),
  venue: z.string().trim().max(120).nullable().optional(),
  area: z.string().max(80).nullable().optional(),
  /** Other venues: a route, where it starts and ends. Left out keeps them; a list (even empty) replaces them. */
  venues: z.array(z.object({ venue: z.string().trim().min(1).max(120), area: z.string().max(80).nullable().optional(), role: z.enum(VENUE_ROLES) })).max(MAX_EXTRA_VENUES).optional(),
  startsAt: when,
  endsAt: when.nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
  /** Team-only: where the details came from. Readers never see it. */
  sourceNote: z.string().trim().max(500).nullable().optional(),
  url: z.url().max(500).nullable().optional(),
  /** What the event is, shown on the schedule; the note is the short line changes replace. */
  description: z.string().trim().max(1000).nullable().optional(),
  official: z.boolean().optional(),
  /** Who runs a non-official event, like a bar or a school. */
  organiser: z.string().trim().max(120).nullable().optional(),
  /** The sponsor, like "Coca-Cola". */
  presentedBy: z.string().trim().max(120).nullable().optional(),
  /** A date-only event: only the date of `startsAt` counts. */
  allDay: z.boolean().optional(),
  /** False when the time is still to follow: only the date of `startsAt` counts. */
  timeKnown: z.boolean().optional(),
  /** The last day (`YYYY-MM-DD`, Manila) of a daily event: `startsAt`/`endsAt` are the first day's hours, repeated each day. Null makes it a single event; left out keeps what it has. */
  repeatUntil: z.iso.date().nullable().optional(),
  /** Called-off days of a repeating event. Left out keeps them; the editor sends a shorter list to bring a day back. */
  skipDates: z.array(z.iso.date()).max(MAX_REPEAT_DAYS + 1).optional(),
  /** Also publish a feed item for a new event; ignored when editing. */
  announce: z.boolean().optional(),
  /** Topic keys; at least one. */
  topics: z.array(z.string().max(80)).max(8),
}).refine((e) => e.official !== false || !!(e.organiser || e.presentedBy), {
  path: ["organiser"],
  message: "Say who is putting it on: an organiser, or a sponsor in presentedBy.",
}).refine((e) => !repeatProblem(e.startsAt, e.repeatUntil), {
  path: ["repeatUntil"],
  message: "The last day must be after the first, and at most 62 days on.",
}).refine((e) => !(e.allDay && e.timeKnown === false), {
  path: ["timeKnown"],
  message: "An event is all day or time to follow, not both.",
});

team.get("/events", async (c) => c.json(await listEvents(c.get("db"))));

team.post("/events", async (c) => {
  const body = eventBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const author = authorOf(c.get("actor"));
  const values = await eventValues(db, body.data, author, true);
  if ("error" in values) return c.json(values, 400);
  const extra = await resolveVenues(db, body.data.venues);
  if ("error" in extra) return c.json(extra, 400);
  const sourceId = body.data.announce ? await teamSource(db) : "";
  const row = await db.transaction(async (tx) => {
    const [made] = await tx.insert(events).values(values).returning({ id: events.id });
    await saveVenues(tx, made.id, extra.rows);
    await setDeskTopics(tx, "event", made.id, body.data.topics, enteredBy(author));
    if (body.data.announce) {
      const startsAt = values.plannedStart;
      // An all-day or time-to-follow event has a date, not a start time, so its card carries none.
      const timed = !values.allDay && values.timeKnown !== false;
      const [item] = await tx
        .insert(items)
        .values({
          sourceId,
          ...enteredBy(author),
          // A community event is not the festival's own schedule, so it files under 3rd-party events.
          category: values.official === false ? "third_party_event" : "schedule_change",
          ...fitHeadline(
            `New: ${values.title}, ${values.repeatUntil ? repeatWhen({ startsAt: startsAt.toISOString(), endsAt: values.plannedEnd?.toISOString() ?? null, allDay: values.allDay, timeKnown: values.timeKnown, repeatUntil: values.repeatUntil }) : eventWhen({ startsAt: startsAt.toISOString(), allDay: values.allDay, timeKnown: values.timeKnown })}`,
            [presenterLine(values), values.description ?? values.note].filter(Boolean).join("\n"),
          ),
          areaId: values.areaId,
          // A daily event's card words the whole run, so it has no single start.
          startsAt: timed && !values.repeatUntil ? startsAt : undefined,
          url: values.url,
          publishedAt: new Date(),
        })
        .returning({ id: items.id });
      await tx.insert(eventUpdates).values({ eventId: made.id, itemId: item.id, kind: "schedule_change", note: values.note, newStart: startsAt });
    }
    return made;
  });
  return c.json(row, 201);
});

team.put("/events/:id", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  const body = eventBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success) return c.json({ error: "not found" }, 404);
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const author = authorOf(c.get("actor"));
  const values = await eventValues(db, body.data, author, false);
  if ("error" in values) return c.json(values, 400);
  const extra = await resolveVenues(db, body.data.venues);
  if ("error" in extra) return c.json(extra, 400);
  // A start moved on its own must still leave the stored last day after it and within the limit.
  if (body.data.repeatUntil === undefined) {
    const [stored] = await db.select({ repeatUntil: events.repeatUntil }).from(events).where(eq(events.id, id.data)).limit(1);
    const problem = storedRepeatProblem(body.data.startsAt, stored?.repeatUntil);
    if (problem) return c.json({ error: problem }, 400);
  }
  const row = await db.transaction(async (tx) => {
    // A new start in the editor is the plan now, so Back on schedule mustn't restore the one before it.
    // It is no longer late or waiting on a time either.
    const sameStart = sql`${events.plannedStart} = ${values.plannedStart.toISOString()}::timestamptz`;
    const originalStart = sql`case when ${sameStart} then ${events.originalStart} end`;
    const originalKind = sql`case when ${sameStart} then ${events.originalKind} end`;
    const status = sql`case when ${sameStart} or ${events.status} not in ('tba', 'delayed') then ${events.status} else 'scheduled' end`;
    const [saved] = await tx.update(events).set({ ...values, originalStart, originalKind, status }).where(eq(events.id, id.data)).returning({ id: events.id });
    if (saved) await setDeskTopics(tx, "event", saved.id, body.data.topics, enteredBy(author));
    if (saved) await saveVenues(tx, saved.id, extra.rows);
    return saved;
  });
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

team.delete("/events/:id", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "not found" }, 404);
  const [row] = await c.get("db").delete(events).where(eq(events.id, id.data)).returning({ id: events.id });
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

/** Why an edit that moves only the start can't keep the run's stored last day, in words that say what to fix; null when it can. */
export function storedRepeatProblem(startsAt: string, repeatUntil: string | null | undefined) {
  const problem = repeatUntil ? repeatProblem(startsAt, repeatUntil) : null;
  return problem && `${problem} The run now ends on ${dayStampOf(repeatUntil!)}: send a new last day too, or clear it to make a single event.`;
}

/** The extra venues with their areas looked up; `rows` is null when the body left them out (keep what the event has). */
type VenueRows = Array<{ venue: string; areaId: string | null; role: EventVenue["role"]; order: number }>;

async function resolveVenues(db: Db, venues: EventVenue[] | undefined): Promise<{ rows: VenueRows | null } | { error: string }> {
  if (!venues) return { rows: null };
  const known = await db.select({ id: areas.id, name: areas.name }).from(areas);
  const rows: VenueRows = [];
  for (const [order, v] of venues.entries()) {
    const areaId = v.area ? known.find((a) => a.name === v.area)?.id : null;
    if (v.area && !areaId) return { error: `unknown area "${v.area}"` };
    rows.push({ venue: v.venue, areaId: areaId ?? null, role: v.role, order });
  }
  return { rows };
}

/** Replaces an event's extra venues, unless the request left them out. */
async function saveVenues(tx: Pick<Db, "insert" | "delete">, eventId: string, rows: VenueRows | null) {
  if (!rows) return;
  await tx.delete(eventVenues).where(eq(eventVenues.eventId, eventId));
  if (rows.length) await tx.insert(eventVenues).values(rows.map((r) => ({ ...r, eventId })));
}

async function eventValues(db: Db, e: z.infer<typeof eventBody>, author: Author, created: boolean) {
  const areaId = e.area ? (await db.select().from(areas).where(eq(areas.name, e.area)).limit(1))[0]?.id : null;
  if (e.area && !areaId) return { error: `unknown area "${e.area}"` };
  if (e.endsAt && Date.parse(e.endsAt) < Date.parse(e.startsAt)) return { error: "the end is before the start" };
  const badTopics = topicsProblem("event", e.topics, await topicKeys(db));
  if (badTopics) return { error: badTopics };
  // A date without a time is stored as that date at 00:00 in Manila, with no end.
  const dateOnly = e.allDay || e.timeKnown === false;
  return {
    title: e.title,
    kind: e.kind,
    venue: e.venue || null,
    areaId,
    plannedStart: new Date(dateOnly ? manilaMidnight(e.startsAt) : e.startsAt),
    plannedEnd: e.endsAt && !dateOnly ? new Date(e.endsAt) : null,
    // Left out when not sent, so an older desk saving an event keeps its flags and credits.
    ...(e.allDay !== undefined && { allDay: e.allDay }),
    ...(e.timeKnown !== undefined && { timeKnown: e.timeKnown }),
    ...(e.repeatUntil !== undefined && { repeatUntil: e.repeatUntil, ...(e.repeatUntil === null && { skipDates: [] }) }),
    ...(e.skipDates !== undefined && e.repeatUntil !== null && { skipDates: e.skipDates }),
    ...(e.organiser !== undefined && { organiser: e.organiser || null }),
    ...(e.presentedBy !== undefined && { presentedBy: e.presentedBy || null }),
    note: e.note || null,
    // Left out when not sent, so an older desk saving an event keeps its description.
    ...(e.description !== undefined && { description: e.description || null }),
    url: e.url || null,
    // Left out when not sent, so an edit keeps the event's flag; a new event defaults to official in the schema.
    ...(e.official !== undefined && { official: e.official }),
    ...authorship(author, created),
  };
}

export async function listEvents(db: Db, from?: Date, alsoIds: string[] = []): Promise<TeamEvent[]> {
  const rows = await db
    .select({ event: events, area: areas.name })
    .from(events)
    .leftJoin(areas, eq(events.areaId, areas.id))
    // An event waiting on its new time stays listed however long ago its old one was.
    // A daily event stays listed while its run lasts.
    .where(from ? or(gte(events.plannedStart, from), gte(events.repeatUntil, manilaDay(from.getTime())), eq(events.status, "tba"), alsoIds.length ? inArray(events.id, alsoIds) : undefined) : undefined)
    .orderBy(asc(events.plannedStart));
  const tagged = await ownTopics(db, "event", rows.map((r) => r.event.id));
  const extra = rows.length
    ? await db
        .select({ eventId: eventVenues.eventId, venue: eventVenues.venue, role: eventVenues.role, area: areas.name })
        .from(eventVenues)
        .leftJoin(areas, eq(eventVenues.areaId, areas.id))
        .where(inArray(eventVenues.eventId, rows.map((r) => r.event.id)))
        .orderBy(asc(eventVenues.order))
    : [];
  return rows.map(({ event: e, area }) => ({
    id: e.id,
    venues: extra.filter((v) => v.eventId === e.id).map((v): EventVenue => ({ venue: v.venue, area: v.area, role: v.role as EventVenue["role"] })),
    repeatUntil: e.repeatUntil,
    skipDates: e.skipDates,
    title: e.title,
    kind: e.kind as TeamEvent["kind"],
    venue: e.venue,
    area,
    startsAt: e.plannedStart.toISOString(),
    endsAt: e.plannedEnd?.toISOString() ?? null,
    originalStart: e.originalStart?.toISOString() ?? null,
    wasDateOnly: e.originalKind !== null,
    actualStart: e.actualStart?.toISOString() ?? null,
    actualEnd: e.actualEnd?.toISOString() ?? null,
    status: e.status,
    note: e.note,
    sourceNote: e.sourceNote,
    description: e.description,
    url: e.url,
    official: e.official,
    organiser: e.organiser,
    presentedBy: e.presentedBy,
    allDay: e.allDay,
    timeKnown: e.timeKnown,
    topics: tagged.get(e.id) ?? [],
  }));
}

// Around places (promos, rides, thrift, food, kiosks)

export const placeBody = z.object({
  /** A `place_kinds` key. */
  kind: z.string().min(1).max(60),
  title: z.string().trim().min(1).max(120),
  place: z.string().trim().min(1).max(160),
  area: z.string().max(80).nullable().optional(),
  hours: z.string().trim().max(80).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  url: z.url().max(500).nullable().optional(),
  active: z.boolean().optional(),
  /** Closed for now until this time; null reopens it. Left out keeps what a place has. */
  closedUntil: z.iso.datetime({ offset: true }).nullable().optional(),
  /** True archives a place (gone for good, unlike `active`), false restores it. Left out keeps it as it is. */
  archived: z.boolean().optional(),
  /** Topic keys; at least one. */
  topics: z.array(z.string().max(80)).max(8),
  /** The map pin, or null to remove it. Left out keeps the pin a place has. */
  pin: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).nullable().optional(),
});

// Archived places stay out unless asked for (`?archived=1`), so the pickers and the list never offer one.
team.get("/places", async (c) => c.json(await listPlaces(c.get("db"), false, c.req.query("archived") === "1")));

team.post("/places", async (c) => {
  const body = placeBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const author = authorOf(c.get("actor"));
  const values = await placeValues(db, body.data, author, true);
  if ("error" in values) return c.json(values, 400);
  const row = await db.transaction(async (tx) => {
    const [made] = await tx.insert(places).values(values).returning({ id: places.id });
    await setDeskTopics(tx, "place", made.id, body.data.topics, enteredBy(author));
    return made;
  });
  return c.json(row, 201);
});

team.put("/places/:id", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  const body = placeBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success) return c.json({ error: "not found" }, 404);
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const author = authorOf(c.get("actor"));
  const values = await placeValues(db, body.data, author, false);
  if ("error" in values) return c.json(values, 400);
  const row = await db.transaction(async (tx) => {
    const [saved] = await tx.update(places).set(values).where(eq(places.id, id.data)).returning({ id: places.id });
    if (saved) await setDeskTopics(tx, "place", saved.id, body.data.topics, enteredBy(author));
    return saved;
  });
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

async function placeValues(db: Db, p: z.infer<typeof placeBody>, author: Author, created: boolean) {
  const areaId = p.area ? (await db.select().from(areas).where(eq(areas.name, p.area)).limit(1))[0]?.id : null;
  if (p.area && !areaId) return { error: `unknown area "${p.area}"` };
  const [kind] = await db.select({ key: placeKinds.key }).from(placeKinds).where(eq(placeKinds.key, p.kind)).limit(1);
  if (!kind) return { error: `unknown kind "${p.kind}"` };
  const badTopics = topicsProblem("place", p.topics, await topicKeys(db));
  if (badTopics) return { error: badTopics };
  return {
    kind: p.kind,
    name: p.title,
    place: p.place,
    areaId,
    openHours: p.hours || null,
    note: p.note || null,
    url: p.url || null,
    active: p.active ?? true,
    ...(p.closedUntil !== undefined && { closedUntil: p.closedUntil ? new Date(p.closedUntil) : null }),
    ...(p.archived !== undefined && { archivedAt: p.archived ? new Date() : null }),
    ...(p.pin !== undefined && { lat: p.pin?.lat ?? null, lng: p.pin?.lng ?? null }),
    ...authorship(author, created),
  };
}

/** `activeOnly` leaves out hidden places. Archived ones are left out too, unless `withArchived`. */
export async function listPlaces(db: Db, activeOnly = false, withArchived = false): Promise<TeamPlace[]> {
  const rows = await db
    .select({ p: places, area: areas.name, kind: placeKinds })
    .from(places)
    .innerJoin(placeKinds, eq(places.kind, placeKinds.key))
    .leftJoin(areas, eq(places.areaId, areas.id))
    .where(and(activeOnly ? eq(places.active, true) : undefined, withArchived && !activeOnly ? undefined : isNull(places.archivedAt)))
    .orderBy(asc(places.name));
  const tagged = await ownTopics(db, "place", rows.map((r) => r.p.id));
  return rows.map(({ p, area, kind }) => ({
    id: p.id,
    kind: kindOf(kind),
    title: p.name,
    place: p.place ?? area ?? "",
    area,
    hours: p.openHours,
    note: p.note,
    url: p.url,
    active: p.active,
    closedUntil: p.closedUntil?.toISOString() ?? null,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    pin: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null,
    topics: tagged.get(p.id) ?? [],
  }));
}

// Place kinds: what the Kind field picks from. Anyone on the desk can add one while filling in a place.

const kindOf = (k: typeof placeKinds.$inferSelect): PlaceKind => ({ key: k.key, name: k.name, plural: k.plural, icon: k.icon, services: k.services });

// `places` is how many live (not archived) places have the kind, for the staff's Place kinds list.
team.get("/place-kinds", async (c) => {
  const db = c.get("db");
  const rows = await db.select().from(placeKinds).orderBy(asc(placeKinds.name));
  const counts = await db.select({ kind: places.kind, n: sql<number>`count(*)::int` }).from(places).where(isNull(places.archivedAt)).groupBy(places.kind);
  const used = new Map(counts.map((r) => [r.kind, r.n]));
  return c.json(rows.map((k): TeamPlaceKind => ({ ...kindOf(k), aliases: k.aliases, places: used.get(k.key) ?? 0 })));
});

const placeKindBody = z.object({ name: z.string().trim().min(2).max(40) });

// Adds a kind, or returns the one that already has this name, key or alias in any case, so "cr" finds Restroom.
team.post("/place-kinds", async (c) => {
  const body = placeKindBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const name = body.data.name.replace(/\s+/g, " ");
  const [existing] = await db
    .select()
    .from(placeKinds)
    .where(
      sql`lower(${placeKinds.name}) = lower(${name}) or lower(${placeKinds.key}) = lower(${name}) or exists (select 1 from unnest(${placeKinds.aliases}) a where lower(a) = lower(${name}))`,
    )
    .limit(1);
  if (existing) return c.json({ ...kindOf(existing), aliases: existing.aliases } satisfies TeamPlaceKind);
  const taken = await db.select({ key: placeKinds.key }).from(placeKinds);
  const [row] = await db
    .insert(placeKinds)
    .values({
      key: uniqueSlug(name, new Set(taken.map((k) => k.key)), "kind"),
      name,
      plural: pluralOf(name),
      ...authorship(authorOf(c.get("actor")), true),
    })
    .returning();
  return c.json({ ...kindOf(row), aliases: row.aliases } satisfies TeamPlaceKind, 201);
});

export const placeKindEdit = z.object({
  name: z.string().trim().min(2).max(40),
  plural: z.string().trim().min(2).max(60),
  icon: z.enum(PLACE_ICONS),
  aliases: z.array(z.string().trim().min(1).max(40)).max(30),
  services: z.boolean(),
});

export const placeKindMerge = z.object({ into: z.string().min(1).max(60) });

/** The other kind that already answers to `name` (by name, key or alias, in any case), if any. */
export function kindClash(name: string, others: Array<{ key: string; name: string; aliases: string[] }>) {
  const n = name.trim().toLowerCase();
  return others.find((k) => k.name.toLowerCase() === n || k.key.toLowerCase() === n || k.aliases.some((a) => a.toLowerCase() === n));
}

/** The aliases to keep: spaces tidied, repeats and the kind's own name dropped. */
export function tidyAliases(aliases: string[], name: string) {
  const seen = new Set([name.toLowerCase()]);
  return aliases.map((a) => a.replace(/\s+/g, " ").trim()).filter((a) => a && !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase()));
}

// Staff only, like topics. The key stays as it is: it names the kind in #/around/<key>.
team.put("/place-kinds/:key", async (c) => {
  const author = authorOf(c.get("actor"));
  if (author.kind !== "staff") return c.json({ error: "Only staff can change place kinds." }, 403);
  const body = placeKindEdit.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const key = c.req.param("key");
  const name = body.data.name.replace(/\s+/g, " ");
  const aliases = tidyAliases(body.data.aliases, name);
  const others = await db.select().from(placeKinds).where(ne(placeKinds.key, key));
  for (const word of [name, ...aliases]) {
    const clash = kindClash(word, others);
    if (clash) return c.json({ error: `"${word}" is already ${clash.name}'s name or alias.` }, 409);
  }
  const [row] = await db
    .update(placeKinds)
    .set({ name, plural: body.data.plural, icon: body.data.icon, services: body.data.services, aliases, ...authorship(author, false) })
    .where(eq(placeKinds.key, key))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({ ...kindOf(row), aliases: row.aliases } satisfies TeamPlaceKind);
});

/** Why `key` can't be merged into `into`, or null. */
export function mergeProblem(key: string, into: string, known: Set<string>) {
  if (key === PROMO_KIND || into === PROMO_KIND) return "Promo spots are counted on the Promos tile, so that kind can't be merged.";
  if (key === into) return "Pick a different kind to merge into.";
  if (!known.has(key)) return "not found";
  if (!known.has(into)) return `unknown kind "${into}"`;
  return null;
}

// Staff only. Moves the kind's places (archived ones too) to `into`, which also answers to the old name and
// aliases from then on, and deletes the kind.
team.post("/place-kinds/:key/merge", async (c) => {
  const author = authorOf(c.get("actor"));
  if (author.kind !== "staff") return c.json({ error: "Only staff can merge place kinds." }, 403);
  const body = placeKindMerge.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const key = c.req.param("key");
  const all = await db.select().from(placeKinds);
  const problem = mergeProblem(key, body.data.into, new Set(all.map((k) => k.key)));
  if (problem === "not found") return c.json({ error: problem }, 404);
  if (problem) return c.json({ error: problem }, 400);
  const from = all.find((k) => k.key === key)!;
  const target = all.find((k) => k.key === body.data.into)!;
  const result = await db.transaction(async (tx) => {
    const moved = await tx.update(places).set({ kind: target.key }).where(eq(places.kind, key)).returning({ id: places.id });
    const [row] = await tx
      .update(placeKinds)
      .set({ aliases: tidyAliases([...target.aliases, from.name, ...from.aliases], target.name), ...authorship(author, false) })
      .where(eq(placeKinds.key, target.key))
      .returning();
    await tx.delete(placeKinds).where(eq(placeKinds.key, key));
    return { moved: moved.length, row };
  });
  return c.json({ moved: result.moved, into: { ...kindOf(result.row), aliases: result.row.aliases } });
});

/** A plural for a new kind's filter chip: "Photo booth" → "Photo booths". Staff can fix odd ones later. */
export function pluralOf(name: string) {
  if (/(s|x|z|ch|sh)$/i.test(name)) return `${name}es`;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  return `${name}s`;
}

// Topics: what visitors follow (food, music, sports > chess). Anyone on the desk can add one while tagging
// an entry; staff rename them, edit aliases, icons and order, move them under another root or hide them.
// `key` never changes, since visitors' saved interests name it.

const topicOf = (t: typeof topics.$inferSelect): TeamTopic => ({ key: t.key, parentKey: t.parentKey, name: t.name, aliases: t.aliases, icon: t.icon, hidden: t.hidden, order: t.order });

team.get("/topics", async (c) => {
  const rows = await c.get("db").select().from(topics).orderBy(asc(topics.order), asc(topics.name));
  return c.json(rows.map(topicOf));
});

const topicBody = z.object({ name: z.string().trim().min(2).max(40), parentKey: z.string().max(80).nullable().optional() });

// Adds a topic (under `parentKey`, a root), or returns the one that already has this name, key or alias
// in any case, so "ahedres" finds Chess.
team.post("/topics", async (c) => {
  const body = topicBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const name = body.data.name.replace(/\s+/g, " ");
  const [existing] = await db
    .select()
    .from(topics)
    .where(sql`lower(${topics.name}) = lower(${name}) or lower(${topics.key}) = lower(${name}) or exists (select 1 from unnest(${topics.aliases}) a where lower(a) = lower(${name}))`)
    .limit(1);
  if (existing) return c.json(topicOf(existing));
  const all = await db.select({ key: topics.key, parentKey: topics.parentKey, order: topics.order }).from(topics);
  const parent = body.data.parentKey ? all.find((t) => t.key === body.data.parentKey) : undefined;
  if (body.data.parentKey && !parent) return c.json({ error: `unknown topic "${body.data.parentKey}"` }, 400);
  if (parent?.parentKey) return c.json({ error: "Topics go two levels deep at most. Pick a main topic." }, 400);
  const siblings = all.filter((t) => t.parentKey === (parent?.key ?? null));
  const slug = uniqueSlug(name, new Set(siblings.map((t) => t.key.split(".").pop()!)), "topic");
  const [row] = await db
    .insert(topics)
    .values({
      key: parent ? `${parent.key}.${slug}` : slug,
      parentKey: parent?.key ?? null,
      name,
      order: Math.max(0, ...siblings.map((t) => t.order)) + 10,
      ...authorship(authorOf(c.get("actor")), true),
    })
    .returning();
  return c.json(topicOf(row), 201);
});

const topicEdit = z.object({
  name: z.string().trim().min(2).max(40),
  parentKey: z.string().max(80).nullable(),
  aliases: z.array(z.string().trim().min(1).max(40)).max(30),
  icon: z.string().trim().max(40).nullable(),
  hidden: z.boolean(),
  order: z.number().int().min(0).max(10_000),
});

// Staff only. The key stays as it is even when the topic moves under another root.
team.put("/topics/:key", async (c) => {
  const author = authorOf(c.get("actor"));
  if (author.kind !== "staff") return c.json({ error: "Only staff can change topics." }, 403);
  const body = topicEdit.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const key = c.req.param("key");
  const { parentKey, aliases, ...rest } = body.data;
  if (parentKey) {
    const [parent] = await db.select({ parentKey: topics.parentKey }).from(topics).where(eq(topics.key, parentKey)).limit(1);
    if (!parent) return c.json({ error: `unknown topic "${parentKey}"` }, 400);
    if (parent.parentKey || parentKey === key) return c.json({ error: "Topics go two levels deep at most. Pick a main topic." }, 400);
    const [child] = await db.select({ key: topics.key }).from(topics).where(eq(topics.parentKey, key)).limit(1);
    if (child) return c.json({ error: "This topic has topics under it, so it has to stay a main topic." }, 400);
  }
  const [row] = await db
    .update(topics)
    .set({ ...rest, parentKey, icon: rest.icon || null, aliases: [...new Set(aliases.map((a) => a.replace(/\s+/g, " ")))], ...authorship(author, false) })
    .where(eq(topics.key, key))
    .returning();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(topicOf(row));
});

const entityTopicsBody = z.object({ topics: z.array(z.string().max(80)).max(8) });

// Staff fix an item's topics, e.g. one the classifier was unsure about. This replaces its guesses, so it
// leaves To verify.
team.put("/items/:id/topics", async (c) => {
  const author = authorOf(c.get("actor"));
  if (author.kind !== "staff") return c.json({ error: "Only staff can change an item's topics." }, 403);
  const id = z.uuid().safeParse(c.req.param("id"));
  const body = entityTopicsBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success) return c.json({ error: "not found" }, 404);
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const problem = topicsProblem("item", body.data.topics, await topicKeys(db));
  if (problem) return c.json({ error: problem }, 400);
  const [item] = await db.select({ id: items.id }).from(items).where(eq(items.id, id.data)).limit(1);
  if (!item) return c.json({ error: "not found" }, 404);
  await setDeskTopics(db, "item", item.id, body.data.topics, enteredBy(author));
  return c.json({ id: item.id, topics: body.data.topics });
});

// Visitor guide: sections of tips (the Visit page, and "Know before you go" on the Now page)

const guideSectionBody = z.object({
  title: z.string().trim().min(1).max(80),
  icon: z.enum(GUIDE_ICONS),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const tipBody = z.object({
  sectionId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(600),
  icon: z.enum(GUIDE_ICONS).nullable().optional(),
  active: z.boolean().optional(),
});

team.get("/guide", async (c) => c.json(await listGuide(c.get("db"))));

team.post("/guide/sections", async (c) => {
  const body = guideSectionBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const existing = await db.select({ slug: tipSections.slug, position: tipSections.position }).from(tipSections);
  const [row] = await db
    .insert(tipSections)
    .values({
      ...body.data,
      slug: uniqueSlug(body.data.title, new Set(existing.map((s) => s.slug))),
      position: Math.max(-1, ...existing.map((s) => s.position)) + 1,
      ...authorship(authorOf(c.get("actor")), true),
    })
    .returning({ id: tipSections.id });
  return c.json(row, 201);
});

team.put("/guide/sections/:id", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  const body = guideSectionBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success) return c.json({ error: "not found" }, 404);
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const [row] = await c
    .get("db")
    .update(tipSections)
    .set({ ...body.data, ...authorship(authorOf(c.get("actor")), false) })
    .where(eq(tipSections.id, id.data))
    .returning({ id: tipSections.id });
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

// Removes the section and its tips.
team.delete("/guide/sections/:id", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "not found" }, 404);
  const [row] = await c.get("db").delete(tipSections).where(eq(tipSections.id, id.data)).returning({ id: tipSections.id });
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

team.post("/guide/tips", async (c) => {
  const body = tipBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const [section] = await db.select({ id: tipSections.id }).from(tipSections).where(eq(tipSections.id, body.data.sectionId)).limit(1);
  if (!section) return c.json({ error: "unknown section" }, 400);
  const [row] = await db
    .insert(tips)
    .values({ ...body.data, position: await nextTipPosition(db, section.id), ...authorship(authorOf(c.get("actor")), true) })
    .returning({ id: tips.id });
  return c.json(row, 201);
});

team.put("/guide/tips/:id", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  const body = tipBody.safeParse(await c.req.json().catch(() => null));
  if (!id.success) return c.json({ error: "not found" }, 404);
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const db = c.get("db");
  const [tip] = await db.select({ sectionId: tips.sectionId }).from(tips).where(eq(tips.id, id.data)).limit(1);
  if (!tip) return c.json({ error: "not found" }, 404);
  const [section] = await db.select({ id: tipSections.id }).from(tipSections).where(eq(tipSections.id, body.data.sectionId)).limit(1);
  if (!section) return c.json({ error: "unknown section" }, 400);
  // A tip moved to another section goes to its end.
  const moved = tip.sectionId !== section.id;
  const [row] = await db
    .update(tips)
    .set({ ...body.data, ...(moved && { position: await nextTipPosition(db, section.id) }), ...authorship(authorOf(c.get("actor")), false) })
    .where(eq(tips.id, id.data))
    .returning({ id: tips.id });
  return c.json(row);
});

team.delete("/guide/tips/:id", async (c) => {
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "not found" }, 404);
  const [row] = await c.get("db").delete(tips).where(eq(tips.id, id.data)).returning({ id: tips.id });
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json(row);
});

const moveBody = z.object({ kind: z.enum(["section", "tip"]), id: z.uuid(), direction: z.enum(["up", "down"]) });

// Moves a section, or a tip within its section, one place up or down by swapping it with its neighbour.
team.post("/guide/move", async (c) => {
  const body = moveBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);
  const { kind, id, direction } = body.data;
  const author = authorship(authorOf(c.get("actor")), false);
  const moved = await c.get("db").transaction(async (tx) => {
    if (kind === "section") {
      const list = await tx.select({ id: tipSections.id, position: tipSections.position }).from(tipSections).orderBy(asc(tipSections.position), asc(tipSections.createdAt));
      const swap = neighbours(list, id, direction);
      if (!swap) return false;
      // Renumber so ties never block a move, touching only the rows whose place changed (each write counts as an edit).
      for (const [i, s] of swap.entries()) if (s.position !== i) await tx.update(tipSections).set({ position: i, ...(s.id === id && author) }).where(eq(tipSections.id, s.id));
      return true;
    }
    const [tip] = await tx.select({ sectionId: tips.sectionId }).from(tips).where(eq(tips.id, id)).limit(1);
    if (!tip) return false;
    const list = await tx.select({ id: tips.id, position: tips.position }).from(tips).where(eq(tips.sectionId, tip.sectionId)).orderBy(asc(tips.position), asc(tips.createdAt));
    const swap = neighbours(list, id, direction);
    if (!swap) return false;
    for (const [i, t] of swap.entries()) if (t.position !== i) await tx.update(tips).set({ position: i, ...(t.id === id && author) }).where(eq(tips.id, t.id));
    return true;
  });
  return moved ? c.json({ ok: true }) : c.json({ error: "can't move that way" }, 409);
});

/** The list with `id` swapped one place up or down, or null when it is not there or already at that end. */
function neighbours<T extends { id: string }>(list: T[], id: string, direction: "up" | "down"): T[] | null {
  const i = list.findIndex((x) => x.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

async function nextTipPosition(db: Db, sectionId: string) {
  const [row] = await db
    .select({ max: sql<number | null>`max(${tips.position})` })
    .from(tips)
    .where(eq(tips.sectionId, sectionId));
  return (row?.max ?? -1) + 1;
}

/** A slug for `#/visit/<slug>` or `#/around/<key>` from a first title, unique among `taken`. */
export function uniqueSlug(title: string, taken: Set<string>, fallback = "section") {
  const base =
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || fallback;
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** Every section with every tip, in order, for the desk editor. */
export async function listGuide(db: Db): Promise<TeamTipSection[]> {
  const [sectionRows, tipRows] = await Promise.all([
    db.select().from(tipSections).orderBy(asc(tipSections.position), asc(tipSections.createdAt)),
    db.select().from(tips).orderBy(asc(tips.position), asc(tips.createdAt)),
  ]);
  return sectionRows.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    icon: s.icon,
    featured: s.featured,
    active: s.active,
    tips: tipRows
      .filter((t) => t.sectionId === s.id)
      .map((t) => ({ id: t.id, sectionId: t.sectionId, title: t.title, body: t.body, icon: t.icon, active: t.active })),
  }));
}

/** The source row team entries are published under, created on first use. Its name follows the app's, so a rename reaches rows made before it. */
async function teamSource(db: Db) {
  const [row] = await db
    .insert(sources)
    .values({ platform: "curator", externalId: "team", name: "Better Maskara team", tier: 2 })
    .onConflictDoUpdate({ target: [sources.platform, sources.externalId], set: { active: true, name: "Better Maskara team" } })
    .returning({ id: sources.id });
  return row.id;
}

export default team;
