import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { z } from "zod";
import { isClosedNow, whereLine } from "../src/lib/places";
import { liveCrowd, READING_FADE_MS } from "../src/lib/crowd";
import { overlayClosures } from "../src/lib/trafficOverlay";
import { CATEGORIES, type AroundPlace, type FeedItem, type FeedResults, type FeedTop, type ResultStage, type ScheduleEvent, type SourceTier, type TrafficArea, type Tip, type Trust, type VisitSection, type WeatherNow } from "../src/lib/types";
import control from "./control/routes";
import { areas, collectors, crowdReadings, crowdReports, events, items, places, rawPosts, resultVersions, sources, trafficReadings, weatherSnapshots } from "./db/schema";
import { runFetcher } from "./ingest/fetchers";
import type { Db } from "./db/client";
import { isDeskEntry } from "./items/desk";
import { recentResultEvents, scheduleResults } from "./scheduleResults";
import { onNow } from "../src/lib/dailyWindow";
import { ownerOf, readerStatus, scheduleRows } from "./schedule";
import { noticesFor, resolvedAmong } from "./items/notices";
import { splitTop } from "./items/tiers";
import { fetchWeather } from "./ingest/weather";
import demoWeather from "./data/demo-weather.json";
import community from "./community";
import { clientIp, findCollector, getDb, sha256, verifyTurnstile, type Env } from "./shared";
import team, { listEvents, listGuide, listPlaces } from "./team";
import { topicsOf, topicTree } from "./topics";

let weatherCache: WeatherNow | undefined;

// The demo image is built for one night: serve the snapshot exported into server/data rather than the
// live table. An empty value (the normal image) means off, and Workers have no `process`.
const demoNow = typeof process === "undefined" ? "" : process.env.DEMO_NOW;

const app = new Hono<{ Bindings: Env }>().basePath("/api");

// Short CDN cache so festival-night spikes hit the edge, not the database.
// Team and mission control routes answer per token, so they are never cached; nor is the review queue for community suggestions.
const privatePaths = /^\/api\/(team|control|community\/review)(\/|$)/;
app.use("*", async (c, next) => {
  await next();
  if (privatePaths.test(c.req.path)) c.header("Cache-Control", "private, no-store");
  else if (c.req.method === "GET" && c.res.ok) c.header("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
});

app.get("/health", (c) => c.json({ ok: true, db: Boolean(c.env.DATABASE_URL) }));

app.get("/areas", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  const rows = await database.select({ name: areas.name }).from(areas).orderBy(asc(areas.name));
  return c.json(rows.map((r) => r.name));
});

app.get("/weather", async (c) => {
  // Demo builds answer before touching the database: its newest row is from whenever the snapshot was
  // taken, not the pinned night this build shows.
  if (demoNow) return c.json(demoWeather as WeatherNow);
  const database = getDb(c.env);
  if (database) {
    const [latest] = await database.select().from(weatherSnapshots).orderBy(desc(weatherSnapshots.fetchedAt)).limit(1);
    if (latest) return c.json(latest.data as WeatherNow);
  }
  // No DB yet: fetch live and keep it for 10 minutes.
  if (!weatherCache || Date.now() - Date.parse(weatherCache.fetchedAt) > 10 * 60_000) weatherCache = await fetchWeather();
  return c.json(weatherCache);
});

const feedQuery = z.object({
  category: z.enum(CATEGORIES).optional(),
  since: z.iso.datetime().optional(),
});

app.get("/feed", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);

  const q = feedQuery.safeParse(c.req.query());
  if (!q.success) return c.json({ error: q.error.issues }, 400);

  const rows = await feedRows(database)
    .where(
      and(
        eq(items.status, "published"),
        q.data.category ? eq(items.category, q.data.category) : undefined,
        q.data.since ? gte(items.publishedAt, new Date(q.data.since)) : undefined,
        // Anything whose end has passed is over, so it leaves the feed.
        or(isNull(items.endsAt), gte(items.endsAt, new Date())),
      ),
    )
    .orderBy(desc(items.publishedAt))
    .limit(50);
  const tagged = await topicsOf(database, "item", rows.map((r) => r.item.id));
  const results = await resultsOf(database, rows.map((r) => r.item.id));
  const resolved = await resolvedAmong(database, rows.map((r) => r.item.id));
  return c.json(rows.map((r) => toFeedItem(r, tagged, results, resolved)));
});

// The hero banner and pins for the top of Now, kept apart from /feed so its shape stays a plain list.
// Only what has started and not ended: a pin for tonight's parade waits until tonight.
app.get("/feed/top", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  const now = new Date();
  const rows = await feedRows(database)
    .where(
      and(
        eq(items.status, "published"),
        gt(items.severity, 0),
        or(isNull(items.startsAt), lte(items.startsAt, now)),
        or(isNull(items.endsAt), gte(items.endsAt, now)),
      ),
    )
    .orderBy(desc(items.publishedAt))
    .limit(20);
  // A pin or banner with daily hours is up only inside them: "tonight's market" shows from 5 PM, not at 10 AM.
  const { hero, pins } = splitTop(rows.filter((r) => onNow({ startsAt: r.item.startsAt?.toISOString() ?? null, endsAt: r.item.endsAt?.toISOString() ?? null, dailyFrom: r.item.dailyFrom, dailyTo: r.item.dailyTo }, now.getTime())).map((r) => ({ severity: r.item.severity, row: r })));
  const tagged = await topicsOf(database, "item", [...(hero ? [hero.row.item.id] : []), ...pins.map((p) => p.row.item.id)]);
  const results = await resultsOf(database, [...(hero ? [hero.row.item.id] : []), ...pins.map((p) => p.row.item.id)]);
  const resolved = await resolvedAmong(database, [...(hero ? [hero.row.item.id] : []), ...pins.map((p) => p.row.item.id)]);
  const top: FeedTop = { hero: hero && toFeedItem(hero.row, tagged, results, resolved), pins: pins.map((p) => toFeedItem(p.row, tagged, results, resolved)) };
  return c.json(top);
});

const parentItem = alias(items, "parent_item");

/** Items with what a feed card shows about them. */
const feedRows = (database: Db) =>
  database
    .select({
      item: items,
      eventTitle: events.title,
      parentTitle: parentItem.title,
      source: sources,
      area: areas,
      place: places,
      url: rawPosts.url,
      desk: isDeskEntry,
      correctedAt: sql<Date | null>`(
        select max(ia.created_at)
        from item_actions ia
        where ia.item_id = ${items.id}
          and ia.action = 'edit'
          and ia.after ?| array['title','body','area']
      )`,
    })
    .from(items)
    .leftJoin(sources, eq(items.sourceId, sources.id))
    .leftJoin(areas, eq(items.areaId, areas.id))
    .leftJoin(places, eq(items.placeId, places.id))
    .leftJoin(events, eq(items.eventId, events.id))
    .leftJoin(parentItem, eq(items.parentItemId, parentItem.id))
    .leftJoin(rawPosts, eq(items.rawPostId, rawPosts.id))
    .$dynamic();

/** The results version each winners item announces, in one query for the whole list. */
async function resultsOf(database: Db, itemIds: string[]) {
  const found = new Map<string, FeedResults>();
  if (!itemIds.length) return found;
  const rows = await database.select().from(resultVersions).where(inArray(resultVersions.itemId, itemIds));
  for (const v of rows)
    if (v.itemId) found.set(v.itemId, { contest: v.contest, stage: v.stage as ResultStage, rows: v.rows, note: v.note, ...(v.stage === "pending" && { expectedAt: v.expectedAt?.toISOString() ?? null }) });
  return found;
}

/** What readers first saw, once a retime has changed the times: only the times that differ, and the latest change in words. */
export function formerTimes(item: { startsAt: Date | null; endsAt: Date | null; originalStartsAt: Date | null; originalEndsAt: Date | null; timeChange: string | null }) {
  if (item.timeChange === null) return {};
  const differs = (a: Date | null, b: Date | null) => (a && b ? a.getTime() !== b.getTime() : a !== b);
  const startChanged = differs(item.originalStartsAt, item.startsAt);
  const endChanged = differs(item.originalEndsAt, item.endsAt);
  // Back on the first times, there is no change to show.
  if (!startChanged && !endChanged) return {};
  return {
    formerStartsAt: startChanged ? (item.originalStartsAt?.toISOString() ?? null) : null,
    formerEndsAt: endChanged ? (item.originalEndsAt?.toISOString() ?? null) : null,
    timeChange: item.timeChange,
  };
}

function toFeedItem({ item, eventTitle, parentTitle, source, area, place, url, desk, correctedAt }: Awaited<ReturnType<typeof feedRows>>[number], tagged: Map<string, string[]>, results: Map<string, FeedResults>, resolved: Set<string>): FeedItem {
  return {
    id: item.id,
    ...(item.eventId && eventTitle != null && { event: { id: item.eventId, title: eventTitle } }),
    ...(item.parentItemId && parentTitle != null && { followsUp: { id: item.parentItemId, title: parentTitle } }),
    ...(resolved.has(item.id) && { resolved: true as const }),
    ...(results.has(item.id) && { results: results.get(item.id) }),
    category: item.category,
    title: item.title,
    body: item.body,
    area: area?.name ?? null,
    place: place?.active ? { name: place.name, where: whereLine(place.place, area?.name), pin: place.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : null } : null,
    startsAt: item.startsAt?.toISOString() ?? null,
    endsAt: item.endsAt?.toISOString() ?? null,
    ...(item.dailyFrom != null && item.dailyTo != null && { dailyFrom: item.dailyFrom, dailyTo: item.dailyTo }),
    publishedAt: item.publishedAt.toISOString(),
    ...(item.closureExtent && { closureExtent: item.closureExtent }),
    ...formerTimes(item),
    correctedAt: correctedAt == null ? null : new Date(correctedAt).toISOString(),
    link: item.url,
    source: {
      name: source?.name ?? "Crowd reports",
      tier: (source?.tier ?? 4) as SourceTier,
      platform: source?.platform ?? "crowd",
      url: item.url ?? url ?? source?.url ?? null,
    },
    trust: trustOf(source?.tier ?? 4, item.verifiedAt, desk),
    topics: tagged.get(item.id) ?? [],
  };
}

app.get("/traffic", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);

  const since = new Date(Date.now() - READING_FADE_MS);
  const rows = await database
    .select({ reading: trafficReadings, area: areas.name })
    .from(trafficReadings)
    .innerJoin(areas, eq(trafficReadings.areaId, areas.id))
    .where(gte(trafficReadings.bucketStart, since))
    .orderBy(desc(trafficReadings.bucketStart));

  // Latest bucket per area
  const latest = new Map<string, TrafficArea>();
  for (const { reading, area } of rows) {
    if (latest.has(area)) continue;
    latest.set(area, { area, level: reading.level, reports: reading.itemCount, updatedAt: reading.updatedAt.toISOString() });
  }

  // Active closures keep a road closed on the map until their end time, however old the report.
  const now = new Date();
  const closures = await database
    .select({ area: areas.name, publishedAt: items.publishedAt, extent: items.closureExtent, dailyFrom: items.dailyFrom, dailyTo: items.dailyTo, startsAt: items.startsAt, endsAt: items.endsAt })
    .from(items)
    .innerJoin(areas, eq(items.areaId, areas.id))
    .where(
      and(
        eq(items.category, "road_closure"),
        eq(items.status, "published"),
        or(isNull(items.startsAt), lte(items.startsAt, now)),
        or(isNull(items.endsAt), gte(items.endsAt, now)),
        // A closure with no end time lapses after 12 hours unless someone repeats it.
        or(gte(items.endsAt, now), gte(items.publishedAt, new Date(now.getTime() - 12 * 3_600_000))),
      ),
    );
  overlayClosures(latest, closures, now);
  return c.json([...latest.values()]);
});

// How crowded each place is: the newest reading per area, for 90 minutes. Cached like /traffic.
app.get("/crowd", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  const now = new Date();
  const rows = await database
    .select({ level: crowdReadings.level, note: crowdReadings.note, at: crowdReadings.createdAt, area: areas.name, lat: areas.lat, lng: areas.lng })
    .from(crowdReadings)
    .innerJoin(areas, eq(crowdReadings.areaId, areas.id))
    .where(gte(crowdReadings.createdAt, new Date(now.getTime() - READING_FADE_MS)))
    .orderBy(desc(crowdReadings.createdAt));
  return c.json(liveCrowd(rows, now));
});

app.get("/schedule", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  // From the start of yesterday, so late events and today's full day stay visible.
  const from = new Date(Date.now() - 36 * 3_600_000);
  // A finished event whose results came in recently keeps a card, so late results have somewhere to show.
  const versions = await database
    .select({ eventId: resultVersions.eventId, contest: resultVersions.contest, stage: resultVersions.stage, rows: resultVersions.rows, expectedAt: resultVersions.expectedAt, createdAt: resultVersions.createdAt })
    .from(resultVersions)
    .where(isNotNull(resultVersions.eventId));
  const recent = recentResultEvents(versions, from);
  const listed = await listEvents(database, from, recent);
  // A daily event is a card per night; its topics, results and notices are the event's, and show on the night that is on now or next.
  const rows = scheduleRows(listed, Date.now(), 36 * 3_600_000, new Set(recent));
  const withResults = scheduleResults(versions);
  const tagged = await topicsOf(database, "event", listed.map((e) => e.id));
  const notices = await noticesFor(database, "event", listed.map((e) => e.id), 2);
  const schedule: ScheduleEvent[] = rows.map((e) => ({
    id: e.id,
    ...(e.seriesId && { seriesId: e.seriesId, series: e.series }),
    title: e.title,
    kind: e.kind,
    venue: e.venue ?? e.area ?? "",
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    actualStart: e.actualStart,
    actualEnd: e.actualEnd,
    status: readerStatus[e.status],
    originalStart: e.originalStart,
    wasDateOnly: e.wasDateOnly,
    note: e.note,
    description: e.description,
    url: e.url,
    official: e.official,
    organiser: e.organiser,
    presentedBy: e.presentedBy,
    allDay: e.allDay,
    timeKnown: e.timeKnown,
    topics: tagged.get(ownerOf(e)) ?? [],
    ...(e.venues?.length && { venues: e.venues }),
    ...(e.carries && notices.has(ownerOf(e)) && { notices: notices.get(ownerOf(e)) }),
    ...(e.carries && withResults.get(ownerOf(e))),
  }));
  return c.json(schedule);
});

app.get("/around", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  const rows = await listPlaces(database, true);
  const tagged = await topicsOf(database, "place", rows.map((p) => p.id));
  const notices = await noticesFor(database, "place", rows.map((p) => p.id), 3);
  const around: AroundPlace[] = rows.map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    place: whereLine(p.place, p.area),
    hours: p.hours ?? "",
    note: p.note,
    url: p.url,
    pin: p.pin,
    ...(isClosedNow(p.closedUntil) && { closedUntil: p.closedUntil }),
    topics: tagged.get(p.id) ?? [],
    notices: notices.get(p.id) ?? [],
  }));
  return c.json(around);
});

// What visitors can follow, as a tree, with how much is on for each topic now. Empty ones are kept so the app can gray them.
app.get("/topics", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  return c.json(await topicTree(database));
});

// The visitor guide from the team desk: visible sections with their visible tips, in order.
app.get("/visit", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  const visit: VisitSection[] = (await listGuide(database))
    .filter((s) => s.active)
    .map((s) => ({
      id: s.slug,
      title: s.title,
      icon: s.icon,
      items: s.tips.filter((t) => t.active).map(({ id, title, body, icon }) => ({ id, title, body, icon })),
    }));
  return c.json(visit);
});

// Tips from the sections marked for the Now page, each with an icon (its own or its section's).
app.get("/tips", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);
  const shown: Tip[] = (await listGuide(database))
    .filter((s) => s.active && s.featured)
    .flatMap((s) => s.tips.filter((t) => t.active).map((t) => ({ id: t.id, icon: t.icon ?? s.icon, title: t.title, body: t.body, section: s.slug })));
  return c.json(shown);
});

const reportBody = z.object({
  kind: z.enum(["traffic_sentiment", "delay", "crime_safety", "road_closure", "other"]),
  area: z.string().max(80),
  note: z.string().max(280).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

// Per device (hashed IP): at most this many reports in the window.
const REPORT_LIMIT = 5;
const REPORT_WINDOW_MS = 10 * 60_000;

app.post("/reports", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);

  const body = reportBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);

  const ip = clientIp(c.req.raw.headers);
  if (c.env.TURNSTILE_SECRET && !(await verifyTurnstile(c.env.TURNSTILE_SECRET, body.data.turnstileToken, ip))) {
    return c.json({ error: "bot check failed" }, 403);
  }

  // Counted in the database so the limit holds across Worker isolates.
  const ipHash = await sha256(ip);
  const [recent] = await database
    .select({ n: count() })
    .from(crowdReports)
    .where(and(eq(crowdReports.ipHash, ipHash), gte(crowdReports.createdAt, new Date(Date.now() - REPORT_WINDOW_MS))));
  if (recent.n >= REPORT_LIMIT) {
    c.header("Retry-After", String(REPORT_WINDOW_MS / 1000));
    return c.json({ error: "too many reports, try again in a few minutes" }, 429);
  }
  const [area] = await database.select().from(areas).where(eq(areas.name, body.data.area)).limit(1);

  await database.insert(crowdReports).values({ kind: body.data.kind, areaId: area?.id, note: body.data.note, ipHash });
  return c.json({ ok: true }, 201);
});

// Collector ingestion: monitoring team members or fetchers push posts they found.
// Posts land as raw posts and the ingest run classifies them like any other source.
const collectedPosts = z.object({
  posts: z
    .array(
      z.object({
        platform: z.enum(["facebook", "threads", "x", "web"]),
        url: z.url(),
        // The page or account that published the post, e.g. its handle or page ID.
        author: z.string().min(1).max(200),
        text: z.string().min(1).max(5000),
        postedAt: z.iso.datetime(),
      }),
    )
    .min(1)
    .max(50),
});

app.post("/ingest/posts", async (c) => {
  const database = getDb(c.env);
  if (!database) return c.json({ error: "DATABASE_URL is not set" }, 503);

  const collector = await findCollector(database, c.req.header("authorization"));
  if (!collector) return c.json({ error: "unauthorized" }, 401);

  const body = collectedPosts.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: body.error.issues }, 400);

  // Match each post to a followed source, so official pages keep their tier whoever collected them.
  const known = await database.select().from(sources).where(eq(sources.active, true));
  const inserted = await database
    .insert(rawPosts)
    .values(
      body.data.posts.map((p) => ({
        sourceId: known.find((s) => s.platform === p.platform && s.externalId.toLowerCase() === p.author.toLowerCase())?.id,
        collectorId: collector.id,
        platform: p.platform,
        // Several collectors will see the same post; the URL dedupes them.
        externalId: p.url,
        url: p.url,
        author: p.author,
        text: p.text,
        postedAt: new Date(p.postedAt),
      })),
    )
    .onConflictDoNothing()
    .returning({ id: rawPosts.id });

  await database.update(collectors).set({ lastSeenAt: new Date() }).where(eq(collectors.id, collector.id));
  await runFetcher(database, "classifier");
  return c.json({ received: body.data.posts.length, new: inserted.length }, 201);
});

/**
 * Official page (tier 1–2) beats staff verification, which beats crowd-sourced (§4.3). Team desk
 * entries (by team members or staff) count as verified by staff: the team checked them, but the team is not an official page,
 * so a promo or bazaar a team member posts never looks endorsed by the festival.
 */
function trustOf(tier: number, verifiedAt: Date | null, fromDesk: boolean): Trust {
  if (fromDesk) return "staff";
  if (tier <= 2) return "official";
  return verifiedAt ? "staff" : "crowd";
}




app.route("/team", team);
app.route("/control", control);
app.route("/community", community);

export default app;
