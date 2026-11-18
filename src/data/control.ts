import type {
  ControlActivity,
  ControlBoard,
  ControlFetcherStatus,
  ControlGroup,
  ControlGroupDetail,
  ControlIntake,
  ControlItem,
  ControlPost,
  ControlSources,
  ControlGraph,
  ControlStream,
  UpdateKey,
} from "../lib/types";

// Placeholder mission control board, used when the API is not running. Not real data.
const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();
const intake = (used: number, pending: number, dropped: number): ControlIntake => ({ in: used + pending + dropped, used, pending, dropped });
const none = intake(0, 0, 0);
const line = (min: number, text: string, kind: ControlActivity["kind"] = "item"): ControlActivity => ({ at: ago(min), kind, text });

/** What each group offers in Update mode, as GROUPS in server/control/config.ts has it. */
const updates: Record<string, UpdateKey[]> = {
  weather: ["weather_notice", "refresh:open-meteo"],
  schedule: ["schedule_add", "delay", "cancellation", "venue_change", "back_on_schedule"],
  traffic: ["traffic_level"],
  crowd_reports: ["crowd_level"],
  safety: ["safety_notice"],
  announcements: ["announcement", "activity"],
  places: ["place_add", "places_manage"],
  sponsor_games: ["raffle", "sponsor_game"],
  winners: ["winners_post"],
  promos: ["promo", "place_promo"],
  tips: ["tip_add", "tips_manage"],
};
/** The link to each group's full editor, as GROUPS has it. */
const editors: Record<string, UpdateKey> = { schedule: "schedule_manage", places: "places_manage", tips: "tips_manage" };
const about: Record<string, string> = {
  crowd_reports: "Crowd levels from the team. A visitor's report from the Contribute page waits under Visitor suggestions on the team desk until someone approves it.",
};

const group = (
  g: Omit<ControlGroup, "flags" | "problems" | "intake" | "updates" | "categories" | "about"> & Partial<Pick<ControlGroup, "flags" | "problems" | "intake">>,
): ControlGroup => ({
  flags: 0,
  problems: [],
  intake: none,
  updates: updates[g.key] ?? [],
  categories: [],
  about: about[g.key] ?? null,
  ...g,
});

const groups: ControlGroup[] = [
  group({
    key: "weather",
    label: "Weather",
    health: "red",
    lastUpdateAt: ago(47),
    staleMinutes: 30,
    problems: ["Open-Meteo: 3 failed runs in a row"],
    activity: [line(2, "Open-Meteo: request timed out", "error"), line(17, "Open-Meteo: request timed out", "error"), line(32, "Open-Meteo: request timed out", "error"), line(47, "Open-Meteo 29°C", "update")],
  }),
  group({
    key: "schedule",
    label: "Schedule",
    health: "green",
    lastUpdateAt: ago(18),
    staleMinutes: 120,
    intake: intake(3, 1, 0),
    activity: [line(18, "Arena dance competition moved to 4:00 PM"), line(18, "Arena dance competition: delay", "update"), line(95, "Electric MassKara is back on schedule")],
  }),
  group({
    key: "traffic",
    label: "Traffic",
    health: "green",
    flags: 2,
    lastUpdateAt: ago(4),
    staleMinutes: 60,
    intake: intake(14, 2, 5),
    activity: [line(4, "Lacson St heavy", "update"), line(4, "Closed: Lacson St from 6:00 PM"), line(9, "Heavy traffic on Lacson St"), line(12, "Araneta St moderate", "update"), line(26, "Traffic advisory: 6th St")],
  }),
  group({ key: "safety", label: "Public safety", health: "gray", lastUpdateAt: ago(140), staleMinutes: 60, intake: intake(1, 0, 2), activity: [line(140, "Lost child found near the Capitol lagoon")] }),
  group({
    key: "announcements",
    label: "Announcements",
    health: "green",
    lastUpdateAt: ago(50),
    staleMinutes: 6 * 60,
    intake: intake(2, 0, 0),
    activity: [line(50, "Shuttle service to the arena starts at 3:00 PM"), line(260, "Mask making workshop at the Capitol lagoon")],
  }),
  group({
    key: "places",
    label: "Places",
    health: "green",
    lastUpdateAt: ago(40),
    staleMinutes: 24 * 60,
    activity: [line(40, "Food updated: Lagoon food park", "update"), line(300, "Kiosk added: Public Plaza info desk", "update")],
  }),
  group({ key: "sponsor_games", label: "Sponsor games", health: "gray", lastUpdateAt: ago(8 * 60), staleMinutes: 6 * 60, intake: intake(0, 1, 0), activity: [line(8 * 60, "Raffle draw at the Robinsons stage")] }),
  group({ key: "winners", label: "Winners", health: "green", lastUpdateAt: ago(3 * 60), staleMinutes: 24 * 60, activity: [line(3 * 60, "Winners: Street dance, barangay category")] }),
  group({ key: "promos", label: "Promos", health: "gray", lastUpdateAt: null, staleMinutes: 6 * 60, activity: [] }),
  group({ key: "tips", label: "Tips", health: "green", lastUpdateAt: ago(26 * 60), staleMinutes: 3 * 24 * 60, activity: [line(26 * 60, "Tip added: Carry small bills", "update")] }),
  group({
    key: "crowd_reports",
    label: "Crowd reports",
    health: "green",
    lastUpdateAt: ago(6),
    staleMinutes: 15,
    activity: [line(6, "road blocked · Lacson St: barricades at 10th", "update"), line(14, "long queue · Public Plaza", "update")],
  }),
];

const summaryIntake: ControlIntake = intake(18, 4, 20);

export const sampleControlBoard: ControlBoard = {
  generatedAt: ago(0),
  summary: {
    broken: groups.filter((g) => g.health === "red").length,
    stale: groups.filter((g) => g.health === "gray").length,
    flags: groups.reduce((n, g) => n + (g.flags ?? 0), 0),
    suggestions: 2,
    intake: summaryIntake,
  },
  groups,
};

const post = (min: number, p: Omit<ControlPost, "id" | "origin" | "receivedAt" | "url" | "official" | "mine"> & Partial<Pick<ControlPost, "origin" | "official" | "mine">>): ControlPost => ({
  id: `sample-${min}`,
  origin: "post",
  receivedAt: ago(min),
  url: null,
  official: false,
  mine: false,
  ...p,
});

export const sampleControlStream: ControlStream = {
  generatedAt: ago(0),
  intake: summaryIntake,
  posts: [
    post(3, {
      platform: "facebook",
      author: "Bacolod City PIO",
      text: "ADVISORY: Lacson St will be closed from 6th to 21st St starting 6:00 PM for the street dance.",
      via: { kind: "team", name: "Maria" },
      official: true,
      outcome: "used",
      reason: null,
      item: { id: "i1", category: "road_closure", title: "Closed: Lacson St from 6:00 PM", area: "Lacson St", status: "published", flag: null, verifiedAt: null },
    }),
    post(6, {
      origin: "desk",
      platform: "desk",
      author: null,
      text: "Heavy traffic on Araneta St",
      via: { kind: "team", name: "Maria" },
      outcome: "used",
      reason: null,
      item: { id: "i5", category: "traffic_sentiment", title: "Heavy traffic on Araneta St", area: "Araneta St", status: "published", flag: null, verifiedAt: null },
    }),
    post(9, {
      platform: "facebook",
      author: "juan.dc",
      text: "lacson open na ya, nakaagi lang ko",
      via: { kind: "team", name: "Juan" },
      outcome: "pending",
      reason: "Waiting for review",
      item: { id: "i2", category: "road_reopening", title: "Lacson St open", area: "Lacson St", status: "needs_review", flag: "conflict", verifiedAt: null },
    }),
    post(14, {
      platform: "curator",
      author: null,
      text: "Arena dance competition pushed back to 4:00 PM, per the organizers' page.",
      via: { kind: "curator", name: null },
      outcome: "used",
      reason: null,
      item: { id: "i3", category: "delay", title: "Arena dance competition moved to 4:00 PM", area: "Panaad Park", status: "published", flag: null, verifiedAt: ago(12) },
    }),
    post(22, {
      platform: "x",
      author: "bcdtraffic",
      text: "Heavy traffic on Araneta St near the public plaza",
      via: { kind: "team", name: "Maria" },
      outcome: "pending",
      reason: "Not classified yet",
      item: null,
    }),
    post(31, {
      platform: "facebook",
      author: "ukay.finds.bcd",
      text: "Selling preloved shoes, PM me!",
      via: { kind: "source", name: null },
      outcome: "dropped",
      reason: "Ignored: irrelevant",
      item: null,
    }),
  ],
};

/** The sample stream as a graph, roughly as GET /api/control/graph would draw it. */
export const sampleControlGraph: ControlGraph = {
  generatedAt: ago(0),
  truncated: false,
  nodes: [
    { id: "person:maria", kind: "person", label: "Maria (team)" },
    { id: "person:juan", kind: "person", label: "Juan (team)" },
    { id: "person:site-owner", kind: "person", label: "Site owner" },
    { id: "source:pio", kind: "source", label: "Bacolod City PIO" },
    { id: "post:3", kind: "post", label: "ADVISORY: Lacson St will be closed from 6th to 21st St" },
    { id: "post:9", kind: "post", label: "lacson open na ya, nakaagi lang ko" },
    { id: "post:14", kind: "post", label: "Arena dance competition pushed back to 4:00 PM" },
    { id: "item:i1", kind: "item", label: "Closed: Lacson St from 6:00 PM", group: "traffic", category: "road_closure", status: "published" },
    { id: "item:i2", kind: "item", label: "Lacson St open", group: "traffic", category: "road_reopening", status: "needs_review" },
    { id: "item:i3", kind: "item", label: "Arena dance competition moved to 4:00 PM", group: "schedule", category: "delay", status: "published" },
    { id: "item:i5", kind: "item", label: "Heavy traffic on Araneta St", group: "traffic", category: "traffic_sentiment", status: "published" },
    { id: "event:arena", kind: "event", label: "Arena dance competition" },
    { id: "place:lagoon", kind: "place", label: "Lagoon food park" },
    { id: "area:lacson", kind: "area", label: "Lacson St" },
    { id: "area:araneta", kind: "area", label: "Araneta St" },
    { id: "area:panaad", kind: "area", label: "Panaad Park" },
  ],
  edges: [
    { from: "person:maria", to: "post:3", kind: "sent" },
    { from: "source:pio", to: "post:3", kind: "sent" },
    { from: "person:juan", to: "post:9", kind: "sent" },
    { from: "person:site-owner", to: "post:14", kind: "sent" },
    { from: "post:3", to: "item:i1", kind: "became" },
    { from: "post:9", to: "item:i2", kind: "became" },
    { from: "post:14", to: "item:i3", kind: "became" },
    { from: "person:maria", to: "item:i5", kind: "entered" },
    { from: "person:maria", to: "place:lagoon", kind: "entered" },
    { from: "item:i1", to: "area:lacson", kind: "in_area" },
    { from: "item:i2", to: "area:lacson", kind: "in_area" },
    { from: "item:i5", to: "area:araneta", kind: "in_area" },
    { from: "item:i3", to: "event:arena", kind: "about_event" },
    { from: "event:arena", to: "area:panaad", kind: "in_area" },
    { from: "item:i2", to: "item:i1", kind: "contradicts" },
  ],
};

const fetcher = (s: Partial<ControlFetcherStatus>): ControlFetcherStatus => ({
  health: "green",
  problem: null,
  lastRunAt: ago(4),
  lastOkAt: ago(4),
  lastError: null,
  failedInRow: 0,
  errors24h: 0,
  postsIn24h: 0,
  ...s,
});

export const sampleControlSources: ControlSources = {
  generatedAt: ago(0),
  fetchers: [
    {
      key: "open-meteo",
      label: "Open-Meteo",
      intervalMinutes: 15,
      sources: [],
      ...fetcher({
        health: "red",
        problem: "3 failed runs in a row",
        lastRunAt: ago(2),
        lastOkAt: ago(47),
        lastError: "request timed out",
        failedInRow: 3,
        errors24h: 3,
        postsIn24h: 30,
      }),
    },
    { key: "classifier", label: "Classifier", intervalMinutes: 15, sources: [], ...fetcher({ postsIn24h: 42 }) },
  ],
  collectors: [
    { id: "c1", name: "Maria", active: true, health: "active", lastSeenAt: ago(11), posts24h: 23 },
    { id: "c2", name: "Juan", active: true, health: "idle", lastSeenAt: ago(6 * 60), posts24h: 4 },
    { id: "c3", name: "Ana", active: true, health: "idle", lastSeenAt: null, posts24h: 0 },
  ],
};

const item = (
  min: number,
  i: Omit<ControlItem, "id" | "publishedAt" | "body" | "url" | "confidence" | "flaggedAt" | "conflictsWith" | "verifiedBy" | "verifiedAt" | "history"> & Partial<ControlItem>,
): ControlItem => ({
  id: `sample-item-${min}`,
  publishedAt: ago(min),
  body: "",
  url: null,
  confidence: 0.9,
  flaggedAt: i.flag ? ago(min) : null,
  conflictsWith: null,
  verifiedBy: null,
  verifiedAt: null,
  history: [],
  ...i,
});

const sampleItems: Record<string, ControlItem[]> = {
  traffic: [
    item(9, {
      category: "traffic_advisory",
      title: "lacson open na ya, nakaagi lang ko",
      area: "Lacson St",
      status: "published",
      source: null,
      by: "Juan",
      flag: "conflict",
      conflictsWith: { id: "sample-item-4", title: "Closed: Lacson St from 6:00 PM" },
    }),
    item(14, { category: "traffic_sentiment", title: "grabe ka traffic sa Araneta", area: "Araneta St", status: "needs_review", source: null, by: "Maria", flag: "low_confidence", confidence: 0.45 }),
    item(26, {
      category: "traffic_advisory",
      title: "Traffic advisory: 6th St",
      area: "6th St",
      status: "published",
      source: { name: "Better Maskara team", tier: 2 },
      by: "Maria",
      flag: null,
      verifiedBy: "Site owner",
      verifiedAt: ago(20),
      history: [{ action: "verify", by: "Site owner", at: ago(20), before: { flag: null }, after: { flag: null } }],
    }),
    item(4, { category: "road_closure", title: "Closed: Lacson St from 6:00 PM", area: "Lacson St", status: "published", source: { name: "Better Maskara team", tier: 2 }, by: "Maria", flag: null }),
    item(210, { category: "road_reopening", title: "Reopened: 21st St", area: null, status: "published", source: { name: "Bacolod City PIO", tier: 1 }, by: null, flag: null }),
  ],
};

/** The slide-over for a sample group: the board's tile plus a few items, flagged first. */
export function sampleGroupDetail(key: string): ControlGroupDetail {
  const group = groups.find((g) => g.key === key) ?? groups[0];
  const red = group.health === "red";
  return {
    ...group,
    generatedAt: ago(0),
    fetchers:
      group.key === "weather"
        ? [{ key: "open-meteo", label: "Open-Meteo", health: "red", problem: "3 failed runs in a row", failedInRow: 3, lastError: "request timed out" }]
        : [{ key: "classifier", label: "Classifier", health: red ? "red" : "green", problem: null, failedInRow: 0, lastError: null }],
    items: sampleItems[group.key] ?? [],
    editor: editors[group.key] ?? null,
  };
}
