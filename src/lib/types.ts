// Shared between the web app and the API.

export const CATEGORIES = [
  "announcement",
  "schedule_change",
  "delay",
  "cancellation",
  "winner",
  "traffic_advisory",
  "road_closure",
  "road_reopening",
  "traffic_sentiment",
  "weather",
  "crime_safety",
  "kiosk",
  "raffle",
  "activity",
  // Non-official happenings people would still want to know about (docs/MISSION_CONTROL.md §1).
  "third_party_event",
  "sponsor_game",
  "promo",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** What the team desk's announcement form can post: everything without a dedicated form. */
export const NOTICE_CATEGORIES = [
  "announcement",
  "crime_safety",
  "weather",
  "raffle",
  "activity",
  "third_party_event",
  "sponsor_game",
  "promo",
  "other",
] as const satisfies readonly Category[];

export const SOURCE_TIERS = { official: 1, authority: 2, community: 3, crowd: 4 } as const;
export type SourceTier = (typeof SOURCE_TIERS)[keyof typeof SOURCE_TIERS];

export type Platform = "facebook" | "threads" | "x" | "web" | "crowd" | "curator";

/** Feed item states. `needs_review` items wait in the curator inbox. */
export const ITEM_STATUSES = ["published", "needs_review", "hidden"] as const;

/** Why an item is flagged as possible misinformation (docs/MISSION_CONTROL.md §4.2). */
export const ITEM_FLAGS = ["conflict", "low_confidence", "unverified_high_stakes"] as const;
export type ItemFlag = (typeof ITEM_FLAGS)[number];

/**
 * Changes to an item, from mission control, the curator inbox or (hide and unhide only) the team desk.
 * Each one is logged in `item_actions`; the rules live in server/items/actions.ts.
 */
export const ITEM_ACTIONS = ["verify", "hide", "unhide", "recategorize", "edit", "return_to_review", "end", "retime"] as const;
export type ItemAction = (typeof ITEM_ACTIONS)[number];

/** One action with what it needs, as sent to POST /api/control/items/:id/actions. */
export type ItemActionInput =
  | { action: "verify" | "hide" | "unhide" | "return_to_review" | "end" }
  | { action: "recategorize"; category: Category }
  /** Area is a name from /api/areas, or null to clear it. */
  | { action: "edit"; title?: string; body?: string; area?: string | null };
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** A feed item as the curator inbox sees it, with the original post and who sent it. */
export interface InboxItem {
  id: string;
  status: ItemStatus;
  category: Category;
  title: string;
  body: string;
  area: string | null;
  confidence: number;
  publishedAt: string;
  createdAt: string;
  source: { name: string; tier: SourceTier } | null;
  post: {
    platform: Platform;
    url: string | null;
    author: string | null;
    text: string;
    /** Team member who sent the post in. */
    collector: string | null;
    /** Staff member who pasted it into the inbox. */
    addedBy: string | null;
  } | null;
}

/** What a road shows on the map. `partial` (one lane or one side shut) is not a reading: it comes from a partial closure post. */
export type TrafficLevel = "clear" | "moderate" | "heavy" | "partial" | "closed";

/** How much of the road a closure shuts. */
export type ClosureExtent = "full" | "partial";

/** A current notice shown on the place or event it is about. */
export interface NoticeLink {
  id: string;
  title: string;
  category: Category;
  startsAt: string | null;
  endsAt: string | null;
}

export interface FeedItem {
  id: string;
  category: Category;
  title: string;
  body: string;
  area: string | null;
  /** The Around place it is about, when the team linked one (a promo at a stall). */
  place?: { name: string; where: string; pin: LatLng | null } | null;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string;
  /** The schedule entry it is about ("during the Street Dance"). */
  event?: { id: string; title: string } | null;
  /** The post it follows up, e.g. a "Found" notice points at the alert. */
  followsUp?: { id: string; title: string } | null;
  /** Daily hours of a range ("every day 5 PM to 2 AM"), minutes after midnight in Manila; both or neither. */
  dailyFrom?: number | null;
  dailyTo?: number | null;
  /** What readers first saw, when the times were changed and these differ from the current ones. */
  formerStartsAt?: string | null;
  formerEndsAt?: string | null;
  /** The latest time change in words ("Extended until 9:00 PM"). */
  timeChange?: string | null;
  /** A road closure that shuts one lane or one side, not the whole road. */
  closureExtent?: "partial";
  /** A safety post a published follow-up has resolved. */
  resolved?: true;
  /** Tickets or more info, when the team saved a link with the post. */
  link?: string | null;
  source: { name: string; tier: SourceTier; platform: Platform; url: string | null };
  /** The public badge (docs/MISSION_CONTROL.md §4.3): an official page, verified by staff, or neither. */
  trust: Trust;
  /** Topic keys it is about, including those of its linked event and place (e.g. `sports.chess`). */
  topics: string[];
  /** When a desk post was corrected in place after it went live. */
  correctedAt?: string | null;
  /** The results a winners post announces, so the card can list them. `body` still holds the same text. */
  results?: FeedResults;
}

/** A winners post's results: rows with the earlier name struck through where a correction changed one. */
export interface FeedResults {
  contest: string;
  stage: ResultStage;
  rows: ResultRow[];
  /** When a pending post says the results will be in. */
  expectedAt?: string | null;
  /** The desk's note, shown under the rows. */
  note?: string | null;
}

export type Trust = "official" | "staff" | "crowd";

/** How loudly an item is announced, kept in `items.severity`: a feed card, pinned to the top of Now, or the hero banner. */
export type Tier = 0 | 1 | 2;
export const TIER_LABELS: Record<Tier, string> = { 0: "Feed", 1: "Pinned", 2: "Banner" };
/** Pins shown at once on Now; older ones fall back to the feed. */
export const MAX_PINS = 3;

/** What `/api/feed/top` returns: the one active hero banner and the newest pins, placed above the feed. */
export interface FeedTop {
  hero: FeedItem | null;
  pins: FeedItem[];
}

export interface TrafficArea {
  area: string;
  level: TrafficLevel;
  reports: number;
  updatedAt: string;
}

/** A live crowd reading for an area (`/api/crowd`). Coordinates are there when the area has them. */
export interface CrowdArea {
  area: string;
  level: "quiet" | "busy" | "packed";
  note?: string;
  lat?: number;
  lng?: number;
  updatedAt: string;
}

export interface WeatherNow {
  temperatureC: number;
  apparentC: number;
  /** Chance of rain you'd notice this hour, as on `WeatherHour`. */
  precipitationProbability: number;
  weatherCode: number;
  isDay: boolean;
  fetchedAt: string;
  /** The hourly forecast from the current hour on, for weather on schedule cards. Older snapshots have none. */
  hourly?: WeatherHour[];
}

/** One forecast hour. `at` is the start of the hour. Fields marked optional are missing on older snapshots. */
export interface WeatherHour {
  at: string;
  temperatureC: number;
  /** What the heat and humidity feel like. */
  apparentC?: number;
  /**
   * 0–100. With `showerProbability` set, the share of ensemble runs with rain you'd notice (2 mm or more
   * in the hour). Without it, the model's chance of any rain at all, which runs much higher.
   */
  precipitationProbability: number;
  /** Share of ensemble runs with any rain at all (0.1 mm or more), 0–100. */
  showerProbability?: number;
  /** Share of ensemble runs with heavy rain (7.5 mm or more), 0–100. */
  heavyProbability?: number;
  /** Millimetres over the hour: the middle ensemble run, or the single forecast when there is no ensemble. */
  precipitationMm: number;
  /** The part of the single forecast's rain that comes from passing storm cells, mm. */
  showersMm?: number;
  weatherCode: number;
  isDay: boolean;
  /** Share of the sky under cloud, 0–100. */
  cloudCover?: number;
  /** Energy available to thunderstorms, J/kg. */
  cape?: number;
  /** Negative when the air is unstable enough for thunderstorms. */
  liftedIndex?: number;
  uvIndex?: number;
}

export const EVENT_KINDS = ["parade", "competition", "concert", "nightlife", "bazaar", "sports", "food", "workshop", "ceremony"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
/** What an extra venue is to its event; the words readers and the desk see are in VENUE_ROLE_LABEL. */
export const VENUE_ROLES = ["route", "start", "finish", "staging", "other"] as const;
export type VenueRole = (typeof VENUE_ROLES)[number];
export const VENUE_ROLE_LABEL: Record<VenueRole, string> = { route: "Route", start: "Starts at", finish: "Ends at", staging: "Staging area", other: "Also at" };
/** The most extra venues an event takes. */
export const MAX_EXTRA_VENUES = 6;
/** A venue an event has besides its main one. `area` is an areas name, so the map can place it. */
export interface EventVenue {
  venue: string;
  area?: string | null;
  role: VenueRole;
}
export type EventStatus = "on_time" | "delayed" | "tba" | "cancelled" | "done";

export interface ScheduleEvent {
  id: string;
  title: string;
  kind: EventKind;
  venue: string;
  startsAt: string;
  endsAt: string | null;
  /** When it really started and ended, once the team marked it; the schedule follows these over the planned times. */
  actualStart?: string | null;
  actualEnd?: string | null;
  status: EventStatus;
  /** The start as first scheduled, when a change has moved it. The schedule strikes it through. */
  originalStart?: string | null;
  /** The first start had no clock (all day or time to follow), so only its day is struck through. */
  wasDateOnly?: boolean;
  /** Short official note, like "Moved from 2 PM". */
  note: string | null;
  /** What the event is; changes never touch it. */
  description?: string | null;
  /** Tickets or more info, when the team saved a link. */
  url?: string | null;
  official: boolean;
  /** Who runs a non-official event, like a bar or a school. */
  organiser?: string | null;
  /** The sponsor, like "Coca-Cola". */
  presentedBy?: string | null;
  /** A date-only event: `startsAt` is that date at 00:00 in Manila, so no clock is shown. */
  allDay?: boolean;
  /** False when the time is still to follow: `startsAt` is the date at 00:00 in Manila. */
  timeKnown?: boolean;
  /** Topic keys it is about. */
  topics: string[];
  /** Other venues of the event (a route, where it ends), after the main `venue`. */
  venues?: EventVenue[];
  /** The latest posted results for this event (standings, final, corrected or revised). */
  results?: { contest: string; stage: ResultStage; rows: ResultRow[]; postedAt: string };
  /** When the latest version is a placeholder: the time the results are expected. */
  resultsExpectedAt?: string | null;
  /** Current notices linked to it (at most 2), apart from its own change and winners posts. */
  notices?: NoticeLink[];
  /** One night of a daily event: the event's own id, which `id` (`<seriesId>@<day>`) is built on. */
  seriesId?: string;
  /** The first and last day (`YYYY-MM-DD`, Manila) of the daily run this is one night of. */
  series?: { from: string; until: string };
}

// Around the festival and visitor guide. Around comes from the team desk; tips and the visit guide are still sample content.

/** Icons a place kind can use, drawn in src/components/AroundView.tsx. A kind the team adds on the spot gets `pin`. */
export const PLACE_ICONS = ["promo", "ride", "thrift", "food", "kiosk", "restroom", "first_aid", "police", "atm", "pin"] as const;
export type PlaceIcon = (typeof PLACE_ICONS)[number];

/** The kind promo spots use: the Promos tile counts them and a promo announcement can point at one. */
export const PROMO_KIND = "promo";

/**
 * A kind of Around place, kept in `place_kinds` so the team can add one while filling in a place. `key`
 * is set once and names the kind in `#/around/<key>`. Services (restrooms, first aid, police, ATMs) are
 * listed apart from the festival spots.
 */
export interface PlaceKind {
  key: string;
  name: string;
  /** For filter chips and headings, e.g. "Carnival rides". */
  plural: string;
  icon: PlaceIcon;
  services: boolean;
}

/** A kind as the team desk picks it, with the other names people use for it ("CR" for Restroom). */
export interface TeamPlaceKind extends PlaceKind {
  aliases: string[];
  /** How many live places have it. Only the staff's kind list asks. */
  places?: number;
}

/** A map pin. */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface AroundPlace {
  id: string;
  kind: PlaceKind;
  title: string;
  place: string;
  hours: string;
  note: string | null;
  /** Its page or more info, when the team saved a link. */
  url?: string | null;
  /** Where it is on the map, when the team dropped a pin. */
  pin?: LatLng | null;
  /** Temporarily closed until then. Only sent while that is still ahead. */
  closedUntil?: string | null;
  /** Topic keys it is about. */
  topics: string[];
  /** Current notices linked to it (at most 3), newest first. */
  notices?: NoticeLink[];
}

/**
 * What visitors can follow (`GET /api/topics`): roots with at most one level of children. `key` is set
 * once, like `sports.chess`. `count` is how many items, events and places are on for it now, children included.
 */
export interface TopicNode {
  key: string;
  name: string;
  /** A lucide icon name, or null. */
  icon: string | null;
  aliases: string[];
  count: number;
  /** The part of `count` that is on now or starts within the day. */
  today: number;
  /** Active places tagged with it. */
  places: number;
  children: TopicNode[];
}

/** A topic as the team desk edits and picks it, hidden ones included. `parentKey` is null for a root. */
export interface TeamTopic {
  key: string;
  parentKey: string | null;
  name: string;
  aliases: string[];
  icon: string | null;
  hidden: boolean;
  order: number;
}

/** Icons the visitor guide can use, for sections and (optionally) single tips. Drawn in src/components/VisitView.tsx. */
export const GUIDE_ICONS = ["water", "cash", "rain", "meet", "map", "compass", "help", "food", "bus", "sun", "phone", "shield"] as const;
export type GuideIcon = (typeof GUIDE_ICONS)[number];

/** A tip from a section shown on the Now page. `icon` falls back to the section's. */
export interface Tip {
  id: string;
  icon: GuideIcon;
  title: string;
  body: string;
  /** The guide section it belongs to, for linking to it. */
  section: string;
}

/** A visitor guide section and its tips, in order. `id` is the section's stable slug, as in `#/visit/<id>`. */
export interface VisitSection {
  id: string;
  title: string;
  icon: GuideIcon;
  items: Array<{ id: string; title: string; body: string; icon: GuideIcon | null }>;
}

/** How far along a contest's results are. Checked in code, the way `events.kind` is. */
export const RESULT_STAGES = ["pending", "standings", "final", "corrected", "revised"] as const;
export type ResultStage = (typeof RESULT_STAGES)[number];

/** One placed result. `was` is the name this label had before a correction. `prize` is money or a trophy. */
export interface ResultRow {
  label: string;
  name: string;
  was?: string;
  prize?: string;
}

/** The latest version of a contest's results, as the team desk's winners form lists them (`GET /api/team/results`). */
export interface TeamResult {
  contestId: string;
  eventId: string | null;
  contest: string;
  stage: ResultStage;
  rows: ResultRow[];
  note: string | null;
  expectedAt: string | null;
  createdAt: string;
  /** Left out of the public read (`/api/community/read/results`). */
  byName?: string;
}

// Team desk: what the team enters directly, instead of copying posts.

/** The levels a team update can set (and `traffic_readings` scores, by position). A partly closed road is a closed update with `extent: "partial"`. */
export const TRAFFIC_LEVELS = ["clear", "moderate", "heavy", "closed"] as const;

/** One update from the team desk. Titles are written by the server from these fields. */
export type TeamUpdate =
  | { type: "advisory"; areas: string[]; startsAt?: string; endsAt?: string; note?: string; url?: string; tier?: Tier }
  /** `startsAt` and `endsAt` schedule a closure, and only count when `level` is closed, as do `extent` (default full) and `lanes` ("northbound lanes"). */
  | { type: "traffic"; areas: string[]; level: (typeof TRAFFIC_LEVELS)[number]; dailyFrom?: number; dailyTo?: number; extent?: ClosureExtent; lanes?: string; startsAt?: string; endsAt?: string; note?: string; url?: string; tier?: Tier }
  /** How crowded a place is right now. Like a traffic level it fades from readers after 90 minutes. */
  | { type: "crowd"; areas: string[]; level: "quiet" | "busy" | "packed"; note?: string }
  | { type: "event"; eventId: string; change: "retime" | "delay" | "extend" | "early" | "move" | "tba" | "cancel" | "venue" | "on_time" | "started" | "ended"; newStart?: string; newEnd?: string; keepDateOnly?: boolean; venue?: string; area?: string; at?: string; day?: string; note?: string; url?: string; tier?: Tier; endsAt?: string }
  | {
      type: "winners";
      eventId?: string;
      contest: string;
      places: Array<string | { label?: string; name: string; prize?: string }>;
      /** Left out, it follows the previous version. Pending is inferred (no places and `pendingUntil`). */
      stage?: "standings" | "final" | "corrected" | "revised";
      /** Continues an earlier contest that isn't on the schedule. */
      contestId?: string;
      /** When the places aren't known yet. */
      pendingUntil?: string;
      note?: string;
      url?: string;
      tier?: Tier;
      endsAt?: string;
      topics?: string[];
    }
  | { type: "notice"; category: (typeof NOTICE_CATEGORIES)[number]; title: string; body?: string; area?: string; placeId?: string; eventId?: string; startsAt?: string; endsAt?: string; dailyFrom?: number; dailyTo?: number; url?: string; tier?: Tier; topics?: string[] };

/** A schedule entry as the team desk edits it. */
export interface TeamEvent {
  id: string;
  /** The last day (`YYYY-MM-DD`, Manila) of a daily event; null is a single event. `startsAt` and `endsAt` are the first day's hours. */
  repeatUntil: string | null;
  /** Days of the run that are called off, `YYYY-MM-DD`. */
  skipDates: string[];
  title: string;
  kind: EventKind;
  venue: string | null;
  area: string | null;
  /** Other venues, in order; the main `venue`/`area` stay as they are. */
  venues?: EventVenue[];
  startsAt: string;
  endsAt: string | null;
  /** The start as first scheduled, while a change has moved it. */
  originalStart: string | null;
  wasDateOnly: boolean;
  actualStart: string | null;
  actualEnd: string | null;
  status: "scheduled" | "delayed" | "ongoing" | "done" | "cancelled" | "tba";
  note: string | null;
  /** Team-only: where the details came from. Only team responses fill it. */
  sourceNote?: string | null;
  description: string | null;
  url: string | null;
  official: boolean;
  organiser: string | null;
  presentedBy: string | null;
  allDay: boolean;
  timeKnown: boolean;
  /** Its own topic keys, as entered on the desk. */
  topics: string[];
}

/** An Around place as the team desk edits it. */
export interface TeamPlace {
  id: string;
  kind: PlaceKind;
  title: string;
  place: string;
  area: string | null;
  hours: string | null;
  note: string | null;
  url: string | null;
  active: boolean;
  /** Temporarily closed until then (a time that has passed means it is open again). */
  closedUntil: string | null;
  /** When it was archived, gone for good; null is live. */
  archivedAt: string | null;
  pin: LatLng | null;
  /** Its own topic keys, as entered on the desk. */
  topics: string[];
}

/** A visitor guide section as the team desk edits it, with every tip, hidden ones included. */
export interface TeamTipSection {
  id: string;
  slug: string;
  title: string;
  icon: GuideIcon;
  /** Its tips show in "Know before you go" on the Now page. */
  featured: boolean;
  active: boolean;
  tips: TeamTip[];
}

export interface TeamTip {
  id: string;
  sectionId: string;
  title: string;
  body: string;
  icon: GuideIcon | null;
  active: boolean;
}

/** A recent team update, so whoever entered it can check it and take it down. */
export interface TeamRecent {
  id: string;
  category: Category;
  title: string;
  area: string | null;
  status: ItemStatus;
  url: string | null;
  by: string | null;
  publishedAt: string;
  body: string;
  startsAt: string | null;
  endsAt: string | null;
  verifiedAt: string | null;
  tier: Tier;
  /** The Around place and the schedule entry it is linked to. */
  place?: string | null;
  event?: string | null;
  /** Safety posts can be resolved with a follow-up; `resolved` once one is out. */
  resolvable?: boolean;
  resolved?: boolean;
  /** Its times can be changed (Change time), and readers told. */
  retimable?: boolean;
  /** Entered by whoever is asking, so a team member may take it down. */
  mine: boolean;
}

// Mission control (internal), see docs/MISSION_CONTROL.md. Served by /api/control.

/** Who a token signs in as. Admin is ADMIN_TOKEN; collectors are team members. */
export type ControlRole = "admin" | "staff" | "collector";

/** GET /api/control/me */
export interface ControlMe {
  name: string;
  role: ControlRole;
}

/**
 * What mission control's Update mode offers on each tile (docs/MISSION_CONTROL.md §3): posting on the
 * team desk, or a staff action. `lands` is the category, feed or fetcher the update freshens, which
 * belongs to the group whose tile offers it (server/control/config.test.ts checks). Keys never equal a
 * group key, since `#/control/<key>` opens either a group or an update form.
 */
export const UPDATES = {
  weather_notice: { lands: "weather" },
  "refresh:open-meteo": { lands: "open-meteo", staffOnly: true },
  delay: { lands: "delay" },
  cancellation: { lands: "cancellation" },
  venue_change: { lands: "schedule_change" },
  back_on_schedule: { lands: "schedule_change" },
  schedule_add: { lands: "events:official" },
  schedule_manage: { lands: "events:official" },
  traffic_level: { lands: "traffic_readings" },
  crowd_level: { lands: "crowd_readings" },
  safety_notice: { lands: "crime_safety" },
  announcement: { lands: "announcement" },
  activity: { lands: "activity" },
  place_add: { lands: "places" },
  places_manage: { lands: "places" },
  raffle: { lands: "raffle" },
  sponsor_game: { lands: "sponsor_game" },
  winners_post: { lands: "winner" },
  promo: { lands: "promo" },
  place_promo: { lands: "place:promo" },
  tip_add: { lands: "tips" },
  tips_manage: { lands: "tips" },
} as const satisfies Record<string, { lands: string; staffOnly?: true }>;
export type UpdateKey = keyof typeof UPDATES;

export const isUpdateKey = (key: string | undefined): key is UpdateKey => key !== undefined && Object.hasOwn(UPDATES, key);

/** Staff-only updates, which team members are not offered. */
export const isStaffOnly = (key: UpdateKey) => "staffOnly" in UPDATES[key];

/** red: broken fetcher. gray: nothing new within the stale window. green: healthy. */
export type GroupHealth = "red" | "gray" | "green";

export interface ControlActivity {
  at: string;
  kind: "item" | "update" | "error";
  text: string;
}

/**
 * Raw posts over the last 24 hours. `used`: became a published item. `pending`: waiting for review
 * or not classified yet. `dropped`: ignored by the classifier or hidden by staff.
 */
export interface ControlIntake {
  in: number;
  used: number;
  pending: number;
  dropped: number;
}

export interface ControlGroup {
  key: string;
  label: string;
  health: GroupHealth;
  /** Open misinformation flags on items in this group that are not hidden. Left out for team members. */
  flags?: number;
  lastUpdateAt: string | null;
  staleMinutes: number;
  intake: ControlIntake;
  /** Why the group is red, one line per failing fetcher. */
  problems: string[];
  activity: ControlActivity[];
  /** What Update mode offers on the tile, in order. */
  updates: UpdateKey[];
  /** The item categories the tile covers, so its update forms can list what's live. */
  categories: Category[];
  /** Where the data comes from, for a group with nothing to update from the wall. */
  about: string | null;
}

export interface ControlBoard {
  generatedAt: string;
  /** `flags` is left out for team members. */
  summary: { broken: number; stale: number; flags?: number; suggestions: number; intake: ControlIntake };
  groups: ControlGroup[];
}

/** idle: never ran, or silent for over a day (switched off). */
export type FetcherHealth = "red" | "green" | "idle";

export interface ControlFetcherStatus {
  health: FetcherHealth;
  /** Why it is red: failed runs in a row, or a missed heartbeat. */
  problem: string | null;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  failedInRow: number;
  errors24h: number;
  postsIn24h: number;
}

export interface ControlFetcher extends ControlFetcherStatus {
  key: string;
  label: string;
  intervalMinutes: number;
  /** Per-page runs, for fetchers that run once per source (FB). */
  sources: Array<ControlFetcherStatus & { id: string; name: string }>;
}

export interface ControlCollector {
  id: string;
  name: string;
  active: boolean;
  health: "active" | "idle";
  lastSeenAt: string | null;
  /** Posts pushed plus team desk entries over the last 24h. */
  posts24h: number;
}

export interface ControlSources {
  generatedAt: string;
  fetchers: ControlFetcher[];
  collectors: ControlCollector[];
}

/** Where a raw post went (§4.4): the same three buckets as the intake counts. */
export type ControlPostOutcome = "used" | "pending" | "dropped";

/**
 * One row of the intake table: a raw post sent in (with what it became), or an entry made directly on
 * the team desk (which has no post, and is not part of the intake counts).
 */
export interface ControlPost {
  id: string;
  origin: "post" | "desk";
  /** When the post came in, or the desk entry was made. */
  receivedAt: string;
  /** The post's platform, or "desk". */
  platform: string;
  author: string | null;
  /** The post's text, or the desk entry's headline and details. */
  text: string;
  url: string | null;
  /**
   * Who sent it in or entered it: a team member, a curator paste, the page it was matched to, or (for
   * desk entries only) a staff member.
   */
  via: { kind: "team" | "staff" | "curator" | "source"; name: string | null };
  /** The matched source is an official page (tier 1–2). Never set for desk entries. */
  official: boolean;
  outcome: ControlPostOutcome;
  /** Why it is pending or dropped, in words: "Waiting for review", "Ignored: irrelevant", "Hidden by staff". */
  reason: string | null;
  /** The signed-in person entered it on the desk, so they may hide and unhide it. */
  mine: boolean;
  item: {
    id: string;
    category: string;
    title: string;
    area: string | null;
    status: ItemStatus;
    /** Left out for team members. */
    flag?: ItemFlag | null;
    verifiedAt: string | null;
    /** Its own topic keys. Left out for team members. */
    topics?: string[];
    /** The classifier guessed its topics without being sure and nobody has fixed them. Left out for team members. */
    topicsUnsure?: boolean;
  } | null;
}

/**
 * The intake table's filters. `open` is everything except dropped; `verify` is what staff should check
 * (waiting for review, flagged and still up, or with topics the classifier wasn't sure of); `flagged` is open flags only. Team members don't get
 * `verify` or `flagged`.
 */
export const INTAKE_FILTERS = ["open", "verify", "flagged", "published", "dropped"] as const;
export type IntakeFilter = (typeof INTAKE_FILTERS)[number];

/** Filters that show flags, which only staff see. */
export const MODERATOR_FILTERS: readonly IntakeFilter[] = ["verify", "flagged"];

/** Whether a row belongs under a filter. The server's query and the sample fallback both follow it. */
export function matchesIntakeFilter(row: Pick<ControlPost, "outcome" | "item">, filter: IntakeFilter): boolean {
  const item = row.item;
  const flagged = Boolean(item?.flag) && item?.status !== "hidden";
  switch (filter) {
    case "open":
      return row.outcome !== "dropped";
    case "verify":
      return item?.status === "needs_review" || flagged || Boolean(item?.topicsUnsure && item.status !== "hidden");
    case "flagged":
      return flagged;
    case "published":
      return item?.status === "published";
    case "dropped":
      return row.outcome === "dropped";
  }
}

export interface ControlStream {
  generatedAt: string;
  /** Last 24h, for the header. Scoped to the group when one is asked for. */
  intake: ControlIntake;
  posts: ControlPost[];
}

/**
 * How entities relate, for the intake panel's graph (GET /api/control/graph). People and sources send
 * posts, posts become items (or people enter items on the desk directly), and items are in areas and
 * about events; places sit in areas.
 */
export const GRAPH_NODE_KINDS = ["person", "source", "post", "item", "event", "place", "area"] as const;
export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];

/** `verified`, `hid` and `contradicts` are left out for team members. */
export const GRAPH_EDGE_KINDS = ["sent", "entered", "became", "in_area", "about_event", "verified", "hid", "contradicts"] as const;
export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];

export interface GraphNode {
  /** Namespaced by kind, e.g. `item:<uuid>`, so ids never clash across tables. */
  id: string;
  kind: GraphNodeKind;
  label: string;
  /** Items: the group whose tile they count towards, and their category. */
  group?: string;
  category?: string;
  /** Items: their status, so the graph can mute hidden ones. */
  status?: ItemStatus;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
}

export interface ControlGraph {
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** More rows matched than the graph draws. */
  truncated: boolean;
}

/** One entry in an item's history: "Verified by Maria · 14:20". */
export interface ControlItemHistory {
  action: ItemAction;
  by: string;
  at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** An item in the slide-over, with its flag, verification and history. */
export interface ControlItem {
  id: string;
  category: Category;
  title: string;
  body: string;
  area: string | null;
  status: ItemStatus;
  url: string | null;
  publishedAt: string;
  source: { name: string; tier: number } | null;
  /** Team member who entered it on the desk, or who sent in the post it came from. */
  by: string | null;
  confidence: number;
  flag: ItemFlag | null;
  flaggedAt: string | null;
  /** The official item it contradicted when it was flagged as a conflict. */
  conflictsWith: { id: string; title: string } | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  history: ControlItemHistory[];
}

/** GET /api/control/groups/:key: everything the slide-over shows. */
export interface ControlGroupDetail extends ControlGroup {
  generatedAt: string;
  /** The fetchers that can turn this group red, with their health. */
  fetchers: Array<Pick<ControlFetcher, "key" | "label" | "health" | "problem" | "failedInRow" | "lastError">>;
  /** Flagged first, then newest. */
  items: ControlItem[];
  /** The group's own full editor (a link update), if it has one. */
  editor: UpdateKey | null;
}

/** "Presented by Coca-Cola", "By Club Zero", or both; null for an event nobody is credited on. */
export function presenterLine(e: { organiser?: string | null; presentedBy?: string | null }): string | null {
  const parts = [e.organiser && `By ${e.organiser}`, e.presentedBy && `Presented by ${e.presentedBy}`].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** A visitor's suggestion from the Contribute page, as the team reviews it (server/community.ts). */
export interface CommunitySubmission {
  id: string;
  /** One line saying what it is: "Road closed: Lacson St". */
  summary: string;
  /** The team desk write it becomes when approved. */
  method: string;
  path: string;
  body: unknown;
  /** The event or place it changes, by its current name, when it names one. */
  about: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  /** Why it was turned down, or what went wrong when someone tried to approve it. */
  reason: string | null;
  /** A short tag for the device it came from, and how many in this list share it. */
  sender: string;
  fromSender: number;
}
