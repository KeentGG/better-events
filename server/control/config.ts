import type { Category, UpdateKey } from "../../src/lib/types";
import type { FeedKey } from "./feeds";

/**
 * Mission control configuration, see docs/MISSION_CONTROL.md §3–4. Groups and fetchers live in code;
 * the only thing staff change from the board is a group's stale window, stored in `data_groups`.
 */

/**
 * How often the ingest pass runs. The Node timer (server/ingest/scheduler.ts) and the Worker cron
 * (wrangler.toml, checked by server/worker.test.ts) both follow it, and fetcher health expects it.
 */
export const INGEST_INTERVAL_MINUTES = 15;

/** Every fetcher that logs to `ingest_runs`, with how often the ingest pass is expected to run it. */
export const FETCHERS = {
  "open-meteo": { label: "Open-Meteo", intervalMinutes: INGEST_INTERVAL_MINUTES },
  classifier: { label: "Classifier", intervalMinutes: INGEST_INTERVAL_MINUTES },
} as const;
export type FetcherKey = keyof typeof FETCHERS;

/** A fetcher is broken after this many failed runs in a row. */
export const FAILED_RUNS_FOR_RED = 3;

/** Activity lines on a tile. */
export const ACTIVITY_LINES = 5;

export interface GroupConfig<K extends string = string> {
  readonly key: K;
  readonly label: string;
  /** Item categories it covers. Every category belongs to exactly one group (config.test.ts). */
  readonly categories: readonly Category[];
  /** Fetchers whose failures turn the group red. */
  readonly fetchers: readonly FetcherKey[];
  /** Extra feeds whose newest row counts as an update (./feeds.ts). */
  readonly feeds: readonly FeedKey[];
  /** Default stale window in minutes; staff can override it from the board. */
  readonly staleMinutes: number;
  /** What Update mode offers on the tile, at most 5 (UPDATES in src/lib/types.ts). */
  readonly updates: readonly UpdateKey[];
  /** The link update to the group's own full editor, shown in the slide-over's footer. */
  readonly editor?: UpdateKey;
  /** Where the data comes from, for a group with no updates. */
  readonly about?: string;
}

// Every group built from classified posts goes red if the classifier breaks.
const posts = ["classifier"] as const;

/** In wall order. */
const groups = [
  {
    key: "weather",
    label: "Weather",
    categories: ["weather"],
    fetchers: ["open-meteo"],
    feeds: ["weather_snapshots"],
    staleMinutes: 30,
    updates: ["weather_notice", "refresh:open-meteo"],
  },
  {
    key: "schedule",
    label: "Schedule",
    // Community events (third_party_event, events:community) live here too: one Add event form asks who is putting it on.
    categories: ["schedule_change", "delay", "cancellation", "third_party_event"],
    fetchers: posts,
    feeds: ["events:official", "events:community"],
    staleMinutes: 120,
    updates: ["schedule_add", "delay", "cancellation", "venue_change", "back_on_schedule"],
    editor: "schedule_manage",
  },
  // Closures live here too: readers see them on the same map, conflicts are about the same roads, and
  // "no new closure lately" is normal, so it made a poor stale signal on a tile of its own.
  {
    key: "traffic",
    label: "Traffic",
    categories: ["traffic_advisory", "traffic_sentiment", "road_closure", "road_reopening"],
    fetchers: posts,
    feeds: ["traffic_readings"],
    // An hourly sweep is the honest cadence. 15 minutes could only stay green by re-posting filler.
    staleMinutes: 60,
    updates: ["traffic_level"],
  },
  { key: "safety", label: "Public safety", categories: ["crime_safety"], fetchers: posts, feeds: [], staleMinutes: 60, updates: ["safety_notice"] },
  {
    key: "announcements",
    label: "Announcements",
    categories: ["announcement", "activity", "other"],
    fetchers: posts,
    feeds: [],
    staleMinutes: 6 * 60,
    updates: ["announcement", "activity"],
  },
  {
    key: "places",
    label: "Places",
    categories: ["kiosk"],
    fetchers: posts,
    feeds: ["places"],
    staleMinutes: 24 * 60,
    updates: ["place_add", "places_manage"],
    editor: "places_manage",
  },
  {
    key: "sponsor_games",
    label: "Sponsor games",
    categories: ["raffle", "sponsor_game"],
    fetchers: posts,
    feeds: [],
    staleMinutes: 6 * 60,
    updates: ["raffle", "sponsor_game"],
  },
  { key: "winners", label: "Winners", categories: ["winner"], fetchers: posts, feeds: [], staleMinutes: 24 * 60, updates: ["winners_post"] },
  { key: "promos", label: "Promos", categories: ["promo"], fetchers: posts, feeds: ["place:promo"], staleMinutes: 6 * 60, updates: ["promo", "place_promo"] },
  // The visitor guide, kept on the team desk.
  { key: "tips", label: "Tips", categories: [], fetchers: [], feeds: ["tips"], staleMinutes: 3 * 24 * 60, updates: ["tip_add", "tips_manage"], editor: "tips_manage" },
  {
    key: "crowd_reports",
    label: "Crowd reports",
    categories: [],
    fetchers: [],
    feeds: ["crowd_readings"],
    staleMinutes: 15,
    updates: ["crowd_level"],
    about: "Crowd levels from the team. A visitor's report from the Contribute page waits under Visitor suggestions on the team desk until someone approves it.",
  },
] as const satisfies readonly GroupConfig[];

export type GroupKey = (typeof groups)[number]["key"];
export const GROUPS: readonly GroupConfig<GroupKey>[] = groups;

const byKey = new Map<string, GroupConfig<GroupKey>>(GROUPS.map((g) => [g.key, g]));
const byCategory = new Map<string, GroupKey>(GROUPS.flatMap((g) => g.categories.map((c) => [c, g.key] as const)));

export const findGroup = (key: string) => byKey.get(key);

/** The one group an item category belongs to. */
export const groupOfCategory = (category: string) => byCategory.get(category);

/** The stale window can be set between 5 minutes and two weeks. */
export const STALE_MINUTES_RANGE = { min: 5, max: 14 * 24 * 60 } as const;
