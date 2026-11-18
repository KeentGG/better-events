import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { CATEGORIES, GUIDE_ICONS, ITEM_ACTIONS, ITEM_FLAGS, ITEM_STATUSES, PLACE_ICONS, type ResultRow } from "../../src/lib/types";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
/**
 * Set on every update, from the database clock like `created_at`, so the two are equal until the row
 * is edited. Mission control reads it to count edits as updates (server/control/feeds.ts).
 */
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`);

export const platform = pgEnum("platform", ["facebook", "threads", "x", "web", "crowd", "curator"]);
export const category = pgEnum("category", CATEGORIES);
export const itemStatus = pgEnum("item_status", ITEM_STATUSES);
export const itemFlag = pgEnum("item_flag", ITEM_FLAGS);
export const itemAction = pgEnum("item_action", ITEM_ACTIONS);
export const placeIcon = pgEnum("place_icon", PLACE_ICONS);
export const guideIcon = pgEnum("guide_icon", GUIDE_ICONS);
export const eventStatus = pgEnum("event_status", ["scheduled", "delayed", "ongoing", "done", "cancelled", "tba"]);
export const trafficLevel = pgEnum("traffic_level", ["clear", "moderate", "heavy", "closed"]);
export const reportStatus = pgEnum("report_status", ["pending", "corroborated", "rejected"]);
export const ingestRunStatus = pgEnum("ingest_run_status", ["running", "ok", "error"]);
export const submissionStatus = pgEnum("submission_status", ["pending", "approved", "rejected"]);
export const postOutcome = pgEnum("post_outcome", ["used", "ignored"]);
export const ignoreReason = pgEnum("ignore_reason", ["irrelevant", "duplicate", "spam"]);

/** Pages and accounts we follow. Tier 1 = official, 2 = authority/media, 3 = community, 4 = crowd. */
export const sources = pgTable(
  "sources",
  {
    id: id(),
    platform: platform("platform").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    url: text("url"),
    tier: smallint("tier").notNull(),
    active: boolean("active").notNull().default(true),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sources_platform_external_uq").on(t.platform, t.externalId)],
);

/**
 * Anything that submits posts: monitoring team members, curators, API fetchers.
 * Each has its own token (stored hashed) so one can be revoked without touching the others.
 */
export const collectors = pgTable("collectors", {
  id: id(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  active: boolean("active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * People who act on data in mission control (docs/MISSION_CONTROL.md), as opposed to collectors, who submit it.
 * Same token pattern as `collectors`: each has a named token, stored hashed, so actions are attributed.
 */
export const staff = pgTable("staff", {
  id: id(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  active: boolean("active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Posts exactly as fetched, kept for audit and re-classification. */
export const rawPosts = pgTable(
  "raw_posts",
  {
    id: id(),
    sourceId: uuid("source_id").references(() => sources.id),
    collectorId: uuid("collector_id").references(() => collectors.id),
    /** Staff member who pasted it into the curator inbox. Null for ADMIN_TOKEN and other paths. */
    staffId: uuid("staff_id").references(() => staff.id),
    platform: platform("platform").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url"),
    author: text("author"),
    text: text("text").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    /** Set by the classifier pass: whether the post became an item, and why not. */
    outcome: postOutcome("outcome"),
    outcomeReason: ignoreReason("outcome_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("raw_posts_platform_external_uq").on(t.platform, t.externalId),
    index("raw_posts_unclassified_idx").on(t.createdAt).where(sql`${t.classifiedAt} is null`),
    index("raw_posts_recent_idx").on(t.createdAt),
  ],
);

/** Bacolod gazetteer used to match place names in posts. */
export const areas = pgTable("areas", {
  id: id(),
  name: text("name").notNull().unique(),
  aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
});

/** Normalized feed entries. */
export const items = pgTable(
  "items",
  {
    id: id(),
    rawPostId: uuid("raw_post_id").references(() => rawPosts.id),
    sourceId: uuid("source_id").references(() => sources.id),
    category: category("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    areaId: uuid("area_id").references(() => areas.id),
    /** The Around place a desk announcement is about, e.g. the stall a promo is at. Cleared if the place is deleted. */
    placeId: uuid("place_id").references((): AnyPgColumn => places.id, { onDelete: "set null" }),
    /** The schedule event a desk notice is about ("during the Street Dance"). Cleared if the event is deleted. */
    eventId: uuid("event_id").references((): AnyPgColumn => events.id, { onDelete: "set null" }),
    /** The post this one follows up, e.g. a "Found" notice points at the lost-child alert. */
    parentItemId: uuid("parent_item_id").references((): AnyPgColumn => items.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** The times readers first saw, kept by the first retime. Null means none (or unchanged; `time_change` says which). */
    originalStartsAt: timestamp("original_starts_at", { withTimezone: true }),
    originalEndsAt: timestamp("original_ends_at", { withTimezone: true }),
    /** The latest retime's wording ("Extended until 9:00 PM"). Set means the times have been changed. */
    timeChange: text("time_change"),
    /** How much of the road a `road_closure` shuts: null is the whole road, `partial` one lane or one side. Only closures have one. */
    closureExtent: text("closure_extent").$type<"partial">(),
    /** Daily hours of a range, minutes after midnight in Manila ("every day 5 PM to 2 AM"); both null or both set, only on an item whose `ends_at` falls on a later day than `starts_at`. A `daily_to` at or before `daily_from` runs past midnight. */
    dailyFrom: smallint("daily_from"),
    dailyTo: smallint("daily_to"),
    severity: smallint("severity").notNull().default(0),
    confidence: real("confidence").notNull().default(1),
    status: itemStatus("status").notNull().default("published"),
    /** Reference link, e.g. the official post an update came from. */
    url: text("url"),
    /** Team member who entered it on the team desk. */
    collectorId: uuid("collector_id").references(() => collectors.id),
    /** Staff member who entered it on the team desk. At most one of `collector_id` and `staff_id` is set; either makes it a desk entry. */
    staffId: uuid("staff_id").references(() => staff.id),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    /** Staff verification (mission control); drives the public "Verified by staff" badge. */
    verifiedBy: uuid("verified_by").references(() => staff.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** Open misinformation flag, or null once staff resolve it. Set by the classifier pass. */
    flag: itemFlag("flag"),
    flaggedAt: timestamp("flagged_at", { withTimezone: true }),
    /** The official item this one contradicted when the classifier flagged it as a conflict. Kept after the flag is resolved. */
    conflictItemId: uuid("conflict_item_id").references((): AnyPgColumn => items.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("items_feed_idx").on(t.status, t.publishedAt),
    index("items_category_idx").on(t.category, t.publishedAt),
    index("items_place_idx").on(t.placeId),
    index("items_event_idx").on(t.eventId),
    index("items_parent_idx").on(t.parentItemId),
    // One item per raw post, so overlapping classifier runs cannot publish a post twice. Desk items have no raw post (NULLs never clash).
    uniqueIndex("items_raw_post_uq").on(t.rawPostId),
    check("items_one_desk_author_ck", sql`${t.collectorId} is null or ${t.staffId} is null`),
    check("items_daily_hours_ck", sql`(${t.dailyFrom} is null) = (${t.dailyTo} is null) and (${t.dailyFrom} is null or (${t.dailyFrom} between 0 and 1439 and ${t.dailyTo} between 0 and 1439 and ${t.dailyFrom} <> ${t.dailyTo}))`),
    check("items_closure_extent_ck", sql`${t.closureExtent} is null or (${t.closureExtent} = 'partial' and ${t.category} = 'road_closure')`),
  ],
);

/**
 * Who added and who last changed an event or place on the team desk: a team member or a staff member,
 * so one of each pair is set. Rows from before these columns, or from seeds, have neither.
 */
const authorship = () => ({
  createdByCollectorId: uuid("created_by_collector_id").references(() => collectors.id),
  createdByStaffId: uuid("created_by_staff_id").references(() => staff.id),
  updatedByCollectorId: uuid("updated_by_collector_id").references(() => collectors.id),
  updatedByStaffId: uuid("updated_by_staff_id").references(() => staff.id),
});

/** Planned festival schedule with live status. */
export const events = pgTable(
  "events",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description"),
    venue: text("venue"),
    areaId: uuid("area_id").references(() => areas.id),
    plannedStart: timestamp("planned_start", { withTimezone: true }).notNull(),
    plannedEnd: timestamp("planned_end", { withTimezone: true }),
    /** The start as first scheduled, saved the first time a change moves it; "Back on schedule" restores it. */
    originalStart: timestamp("original_start", { withTimezone: true }),
    /** What the first start was when it had no clock: 'all_day' or 'time_tba'. Null means it was timed. */
    originalKind: text("original_kind"),
    actualStart: timestamp("actual_start", { withTimezone: true }),
    actualEnd: timestamp("actual_end", { withTimezone: true }),
    status: eventStatus("status").notNull().default("scheduled"),
    /** One of EVENT_KINDS in src/lib/types.ts */
    kind: text("kind").notNull().default("ceremony"),
    /** Short public note, like "Moved from 2 PM". */
    note: text("note"),
    /** Team-only: where the details came from. Never sent to readers. */
    sourceNote: text("source_note"),
    url: text("url"),
    official: boolean("official").notNull().default(true),
    /** Who runs a non-official event: a bar, a school, a music collective. */
    organiser: text("organiser"),
    /** The sponsor, like "Coca-Cola"; official events can have one too. */
    presentedBy: text("presented_by"),
    /** A date-only event like Market Days. `planned_start` holds that date at 00:00 in Manila. */
    allDay: boolean("all_day").notNull().default(false),
    /** False when the time is "to follow"; `planned_start` holds the date at 00:00 in Manila. */
    timeKnown: boolean("time_known").notNull().default(true),
    /** The last Manila day a daily event runs; null is a single event. `planned_start`/`planned_end` are the first day's hours, repeated every day through this one. */
    repeatUntil: date("repeat_until", { mode: "string" }),
    /** Days (Manila) of a repeating event that are called off, each a `YYYY-MM-DD`. */
    skipDates: date("skip_dates", { mode: "string" }).array().notNull().default(sql`'{}'::date[]`),
    ...authorship(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("events_start_idx").on(t.plannedStart)],
);

/** The venues an event has besides its main `venue`/`area`: a route, where it starts and ends, a staging area. */
export const eventVenues = pgTable(
  "event_venues",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    venue: text("venue").notNull(),
    areaId: uuid("area_id").references(() => areas.id),
    /** One of VENUE_ROLES in src/lib/types.ts, checked in code. */
    role: text("role").notNull().default("other"),
    order: integer("order").notNull().default(0),
  },
  (t) => [index("event_venues_event_idx").on(t.eventId)],
);

/** Delays, cancellations and results tied to an event and the item that reported them. */
export const eventUpdates = pgTable(
  "event_updates",
  {
    id: id(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => items.id),
    kind: category("kind").notNull(),
    note: text("note"),
    newStart: timestamp("new_start", { withTimezone: true }),
    results: jsonb("results"),
    createdAt: createdAt(),
  },
  // Mission control's graph looks events up by the items that reported them.
  (t) => [index("event_updates_item_idx").on(t.itemId)],
);

/** Around places: promos, rides, thrift shops, food and kiosks, kept up to date on the team desk. */
/**
 * Kinds of Around place. Seeded with the festival spots and the services people look for; the team adds
 * more while filling in a place. `key` is set once (it names the kind in `#/around/<key>`); `aliases` are
 * the other names people type, so "CR" finds Restroom instead of adding a second kind.
 */
export const placeKinds = pgTable("place_kinds", {
  key: text("key").primaryKey(),
  name: text("name").notNull().unique(),
  plural: text("plural").notNull(),
  icon: placeIcon("icon").notNull().default("pin"),
  /** Restrooms, first aid, police, ATMs: listed apart from the festival spots on Around. */
  services: boolean("services").notNull().default(false),
  aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
  ...authorship(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const places = pgTable("places", {
  id: id(),
  name: text("name").notNull(),
  /** The Around page filter. Promo spots count towards the Promos tile, every other kind towards Places. */
  kind: text("kind")
    .notNull()
    .references(() => placeKinds.key),
  /** Where to find it, as people say it: "Public Plaza, near the stage". */
  place: text("place"),
  note: text("note"),
  url: text("url"),
  active: boolean("active").notNull().default(true),
  /** Temporarily closed (a restroom for the night, an ATM out of cash) until then; null is open as usual. */
  closedUntil: timestamp("closed_until", { withTimezone: true }),
  /** Gone for good, unlike `active` (hidden for now). Null is live. Linked notices keep their link. */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  areaId: uuid("area_id").references(() => areas.id),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  openHours: text("open_hours"),
  itemId: uuid("item_id").references(() => items.id),
  ...authorship(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * What a visitor is into (food, music, sports > chess), so the app can show what matches. Not the item
 * category, which says what kind of message a post is. Staff-managed like `place_kinds`: `key` is set once
 * (`sports.chess`), `aliases` are the other names people type ("ahedres" finds Chess). At most two levels,
 * enforced by a trigger in migration 0018.
 */
export const topics = pgTable(
  "topics",
  {
    key: text("key").primaryKey(),
    parentKey: text("parent_key").references((): AnyPgColumn => topics.key),
    name: text("name").notNull(),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    /** A lucide icon name, or null for the parent's. */
    icon: text("icon"),
    hidden: boolean("hidden").notNull().default(false),
    order: integer("order").notNull().default(0),
    ...authorship(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("topics_parent_idx").on(t.parentKey)],
);

/**
 * Topics tagged on an item, event or place. Polymorphic, so a trigger on each of those tables removes the
 * rows when the entity is deleted. Read through the `entity_effective_topics` view, where an item also gets
 * its linked event's and place's topics.
 */
export const entityTopics = pgTable(
  "entity_topics",
  {
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    topicKey: text("topic_key")
      .notNull()
      .references(() => topics.key, { onDelete: "cascade" }),
    /** Entered on the desk, or suggested by the classifier with a confidence. */
    source: text("source").notNull().default("desk"),
    confidence: real("confidence").notNull().default(1),
    createdByCollectorId: uuid("created_by_collector_id").references(() => collectors.id),
    createdByStaffId: uuid("created_by_staff_id").references(() => staff.id),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.entityType, t.entityId, t.topicKey] }),
    index("entity_topics_topic_idx").on(t.topicKey),
    check("entity_topics_type_ck", sql`${t.entityType} in ('item', 'event', 'place')`),
    check("entity_topics_source_ck", sql`${t.source} in ('desk', 'classifier')`),
  ],
);

/**
 * Visitor guide sections (the Visit page), edited on the team desk. `slug` is set once from the first
 * title and never changes, so `#/visit/<slug>` links keep working after a rename.
 */
export const tipSections = pgTable(
  "tip_sections",
  {
    id: id(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    icon: guideIcon("icon").notNull().default("compass"),
    /** Its tips show in "Know before you go" on the Now page. */
    featured: boolean("featured").notNull().default(false),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    ...authorship(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("tip_sections_slug_uq").on(t.slug)],
);

/** Tips in a visitor guide section, in order. */
export const tips = pgTable(
  "tips",
  {
    id: id(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => tipSections.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** Null uses the section's icon. */
    icon: guideIcon("icon"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    ...authorship(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tips_section_idx").on(t.sectionId, t.position)],
);

/** Traffic score per area and 30-minute bucket. */
export const trafficReadings = pgTable(
  "traffic_readings",
  {
    id: id(),
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id),
    bucketStart: timestamp("bucket_start", { withTimezone: true }).notNull(),
    score: real("score").notNull().default(0),
    level: trafficLevel("level").notNull(),
    itemCount: integer("item_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("traffic_area_bucket_uq").on(t.areaId, t.bucketStart)],
);

/**
 * How crowded an area is, as reported by the team or approved from a visitor's suggestion. The newest
 * row per area counts and fades after 90 minutes. `level` is quiet, busy or packed, checked in code.
 */
export const crowdReadings = pgTable(
  "crowd_readings",
  {
    id: id(),
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id),
    level: text("level").notNull(),
    note: text("note"),
    collectorId: uuid("collector_id").references(() => collectors.id),
    staffId: uuid("staff_id").references(() => staff.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("crowd_readings_area_idx").on(t.areaId, t.createdAt),
    check("crowd_readings_one_author_ck", sql`${t.collectorId} is null or ${t.staffId} is null`),
  ],
);

export const weatherSnapshots = pgTable("weather_snapshots", {
  id: id(),
  provider: text("provider").notNull(),
  data: jsonb("data").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crowdReports = pgTable(
  "crowd_reports",
  {
    id: id(),
    kind: category("kind").notNull(),
    areaId: uuid("area_id").references(() => areas.id),
    note: text("note"),
    ipHash: text("ip_hash").notNull(),
    status: reportStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [index("crowd_reports_recent_idx").on(t.areaId, t.createdAt)],
);

/**
 * Something a visitor proposed on the Contribute page: one team desk write (`method`, `path`, `body`),
 * held here and changing nothing until someone on the team approves it. Approving sends it to the desk
 * under the approver's own sign-in (server/community.ts).
 */
export const submissions = pgTable(
  "submissions",
  {
    id: id(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    body: jsonb("body").notNull(),
    /** One line for the review list, written when it came in. */
    summary: text("summary").notNull(),
    ipHash: text("ip_hash").notNull(),
    status: submissionStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByStaffId: uuid("reviewed_by_staff_id").references(() => staff.id),
    reviewedByCollectorId: uuid("reviewed_by_collector_id").references(() => collectors.id),
    reviewedByName: text("reviewed_by_name"),
    /** Why it was turned down, or what the desk said when an approval didn't go through. */
    reason: text("reason"),
  },
  (t) => [index("submissions_status_idx").on(t.status, t.createdAt), index("submissions_sender_idx").on(t.ipHash, t.createdAt)],
);

/** One row per fetcher run (per source for per-page fetchers). Drives the red state on mission control. */
export const ingestRuns = pgTable(
  "ingest_runs",
  {
    id: id(),
    fetcher: text("fetcher").notNull(),
    sourceId: uuid("source_id").references(() => sources.id),
    status: ingestRunStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    postsIn: integer("posts_in").notNull().default(0),
    error: text("error"),
  },
  (t) => [index("ingest_runs_fetcher_idx").on(t.fetcher, t.startedAt)],
);

/**
 * Mission control stale windows that staff changed from the board. Groups themselves are defined in
 * code (GROUPS in server/control/config.ts); a group with no row here uses its default window.
 */
export const dataGroups = pgTable("data_groups", {
  key: text("key").primaryKey(),
  staleMinutes: integer("stale_minutes").notNull(),
});

/**
 * A monitoring pass that found nothing new (`POST /api/team/lanes/:lane/checked`). Counts on the
 * mission-control tile only: it is not a feed item. `lane` is a group key from `GROUPS`.
 */
export const laneChecks = pgTable(
  "lane_checks",
  {
    id: id(),
    lane: text("lane").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    note: text("note"),
    sources: text("sources").array().notNull().default(sql`'{}'::text[]`),
    collectorId: uuid("collector_id").references(() => collectors.id),
    staffId: uuid("staff_id").references(() => staff.id),
    byName: text("by_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("lane_checks_lane_idx").on(t.lane, t.checkedAt),
    check("lane_checks_one_author_ck", sql`${t.collectorId} is null or ${t.staffId} is null`),
  ],
);

/**
 * Audit log of every change to an item (server/items/actions.ts). `staff_id` or `collector_id` says who;
 * both are null for ADMIN_TOKEN, so `by_name` keeps the name either way. `before` and `after` hold the
 * fields the action changed.
 */
export const itemActions = pgTable(
  "item_actions",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id),
    /** Set instead of `staff_id` when a team member took down their own desk entry. */
    collectorId: uuid("collector_id").references(() => collectors.id),
    byName: text("by_name").notNull(),
    action: itemAction("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [index("item_actions_item_idx").on(t.itemId, t.createdAt)],
);

/**
 * One posting of a contest's results. Every version of that contest shares `contest_id`, which is the
 * first version's `id`. `stage` is one of RESULT_STAGES, checked when the row is written.
 */
export const resultVersions = pgTable(
  "result_versions",
  {
    id: id(),
    contestId: uuid("contest_id").notNull(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    contest: text("contest").notNull(),
    stage: text("stage").notNull(),
    rows: jsonb("rows").$type<ResultRow[]>().notNull().default(sql`'[]'::jsonb`),
    note: text("note"),
    expectedAt: timestamp("expected_at", { withTimezone: true }),
    itemId: uuid("item_id").references(() => items.id),
    collectorId: uuid("collector_id").references(() => collectors.id),
    staffId: uuid("staff_id").references(() => staff.id),
    byName: text("by_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("result_versions_contest_idx").on(t.contestId, t.createdAt),
    index("result_versions_event_idx").on(t.eventId, t.createdAt),
    check("result_versions_one_author_ck", sql`${t.collectorId} is null or ${t.staffId} is null`),
  ],
);
