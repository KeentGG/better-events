import { describe, expect, it } from "vitest";
import type { FeedItem, TrafficArea } from "./types";
import { labelAnchor, mapAreas, trafficAgenda, trafficDetail, trafficStatus } from "./trafficLabel";

const now = new Date("2026-10-17T08:00:00Z"); // 4:00 PM in Bacolod

function item(over: Partial<FeedItem> & Pick<FeedItem, "category" | "area" | "publishedAt">): FeedItem {
  return {
    id: over.id ?? "1",
    title: "",
    body: "",
    startsAt: null,
    endsAt: null,
    source: { name: "Team", tier: 2, platform: "web", url: null },
    trust: "staff",
    topics: [],
    ...over,
  };
}

describe("trafficStatus", () => {
  const road: TrafficArea = { area: "Lacson St", level: "closed", reports: 1, updatedAt: now.toISOString() };
  const closure = (startsAt: string | null, endsAt: string | null) => [item({ category: "road_closure", area: "Lacson St", publishedAt: now.toISOString(), startsAt, endsAt })];

  it("says the day once for a closure days away", () => {
    expect(trafficStatus(road, closure("2026-10-25T02:00:00Z", "2026-10-25T13:00:00Z"), now)).toMatchObject({ headline: "Closes Sun 25 Oct", hours: "10 AM – 9 PM", pending: true });
  });

  it("drops the end day when it runs into the next morning", () => {
    expect(trafficStatus(road, closure("2026-10-25T06:00:00Z", "2026-10-25T21:00:00Z"), now).hours).toBe("2 PM – 5 AM");
  });

  it("keeps the end day on a closure that lasts days", () => {
    expect(trafficStatus(road, closure("2026-10-25T06:00:00Z", "2026-10-27T21:00:00Z"), now).hours).toBe("2 PM – Wed 28 Oct, 5 AM");
  });

  it("says when a closure that is on will lift", () => {
    expect(trafficStatus(road, closure("2026-10-17T02:00:00Z", "2026-10-17T22:00:00Z"), now)).toMatchObject({ headline: "Closed", hours: "until tomorrow 6 AM", pending: false });
  });

  it("has no hours when the post gave none", () => {
    expect(trafficStatus(road, closure(null, null), now)).toMatchObject({ headline: "Closed", hours: null, pending: false });
  });
});

describe("trafficStatus, advisories", () => {
  const ahead = [item({ category: "traffic_advisory", area: "BCGC", publishedAt: now.toISOString(), startsAt: "2026-10-18T07:00:00Z", endsAt: "2026-10-18T13:00:00Z" })];

  it("holds an advisory that has not started as pending", () => {
    const area: TrafficArea = { area: "BCGC", level: "moderate", reports: 1, updatedAt: now.toISOString() };
    expect(trafficStatus(area, ahead, now)).toMatchObject({ headline: "Advisory tomorrow", hours: "3 PM – 9 PM", pending: true });
  });

  it("keeps a reported level over an advisory still ahead", () => {
    const area: TrafficArea = { area: "BCGC", level: "heavy", reports: 3, updatedAt: now.toISOString() };
    expect(trafficStatus(area, ahead, now)).toMatchObject({ headline: "Heavy", hours: "Advisory tomorrow, 3 PM – 9 PM", pending: false });
  });
});

describe("trafficAgenda", () => {
  const closure = (area: string, startsAt: string, endsAt: string) => item({ id: area, category: "road_closure", area, publishedAt: now.toISOString(), startsAt, endsAt });
  const feed = [
    closure("Lacson St", "2026-10-25T06:00:00Z", "2026-10-25T21:00:00Z"),
    closure("Araneta St", "2026-10-21T07:00:00Z", "2026-10-21T11:00:00Z"),
    closure("Gonzaga St", "2026-10-25T02:00:00Z", "2026-10-25T13:00:00Z"),
    closure("Public Plaza", "2026-10-17T02:00:00Z", "2026-10-17T22:00:00Z"),
  ];
  const areas: TrafficArea[] = [
    { area: "Burgos St", level: "heavy", reports: 2, updatedAt: now.toISOString() },
    { area: "Public Plaza", level: "closed", reports: 1, updatedAt: now.toISOString() },
  ];

  it("puts what is on now first, worst first", () => {
    expect(trafficAgenda(areas, feed, now).live.map((r) => r.area.area)).toEqual(["Public Plaza", "Burgos St"]);
  });

  it("lines up what is ahead by day, soonest first", () => {
    const ahead = trafficAgenda(areas, feed, now).ahead;
    expect(ahead.map((d) => [d.day, d.rows.map((r) => r.area.area)])).toEqual([
      ["Wed 21 Oct", ["Araneta St"]],
      ["Sun 25 Oct", ["Gonzaga St", "Lacson St"]],
    ]);
  });
});

describe("trafficDetail", () => {
  const closed: TrafficArea = { area: "Rizal St", level: "closed", reports: 1, updatedAt: now.toISOString() };

  it("adds the closure hours", () => {
    const feed = [item({ category: "road_closure", area: "Rizal St", publishedAt: now.toISOString(), startsAt: "2026-10-17T13:00:00Z", endsAt: "2026-10-17T22:00:00Z" })];
    expect(trafficDetail(closed, feed, now)).toBe("Closes today · 9 PM – 6 AM");
  });

  it("prefers the closure over a crowd report on the same road", () => {
    const feed = [
      item({ id: "crowd", category: "traffic_sentiment", area: "Rizal St", publishedAt: "2026-10-17T09:00:00Z", startsAt: "2026-10-17T09:00:00Z", endsAt: null }),
      item({ id: "close", category: "road_closure", area: "Rizal St", publishedAt: "2026-10-17T07:00:00Z", startsAt: "2026-10-17T13:00:00Z", endsAt: "2026-10-17T22:00:00Z" }),
    ];
    expect(trafficDetail(closed, feed, now)).toBe("Closes today · 9 PM – 6 AM");
  });

  it("is just the level when nothing has hours", () => {
    expect(trafficDetail({ area: "Public Plaza", level: "heavy", reports: 4, updatedAt: now.toISOString() }, [], now)).toBe("Heavy");
  });

  it("calls a heads-up an advisory, in its own hours", () => {
    const area: TrafficArea = { area: "BCGC", level: "moderate", reports: 1, updatedAt: now.toISOString() };
    const feed = [item({ category: "traffic_advisory", area: "BCGC", publishedAt: now.toISOString(), startsAt: "2026-10-17T07:00:00Z", endsAt: "2026-10-17T21:00:00Z" })];
    expect(trafficDetail(area, feed, now)).toBe("Advisory · until tomorrow 5 AM");
  });
});

describe("mapAreas", () => {
  it("draws a closure that has not started yet", () => {
    const feed = [item({ category: "road_closure", area: "Rizal St", publishedAt: now.toISOString(), startsAt: "2026-10-17T13:00:00Z", endsAt: "2026-10-17T22:00:00Z" })];
    expect(mapAreas([], feed)).toEqual([{ area: "Rizal St", level: "closed", reports: 1, updatedAt: now.toISOString() }]);
  });
});

describe("labelAnchor", () => {
  it("stays inside the city when most of the road is outside it", () => {
    const at = labelAnchor({
      type: "LineString",
      coordinates: [
        [122.95, 10.6],
        [122.95, 10.65],
        [122.95, 10.66],
      ],
    });
    expect(at?.[1]).toBeGreaterThan(10.646);
    expect(at?.[1]).toBeLessThan(10.66);
  });

  it("sits at the middle of joined pieces", () => {
    const at = labelAnchor({
      type: "MultiLineString",
      coordinates: [
        [
          [122.95, 10.67],
          [122.951, 10.67],
        ],
        [
          [122.951, 10.67],
          [122.952, 10.67],
        ],
      ],
    });
    expect(at?.[0]).toBeCloseTo(122.951, 4);
    expect(at?.[1]).toBeCloseTo(10.67, 4);
  });
});

describe("partly closed roads", () => {
  const partlyRoad: TrafficArea = { area: "Digicast", level: "partial", reports: 1, updatedAt: now.toISOString() };
  const partial = (over: Partial<FeedItem> = {}) => item({ category: "road_closure", area: "Digicast", publishedAt: now.toISOString(), closureExtent: "partial", ...over });

  it("says partly closed, with the hours", () => {
    expect(trafficStatus(partlyRoad, [partial({ endsAt: "2026-10-17T13:00:00Z" })], now)).toMatchObject({ headline: "Partly closed", hours: "until 9 PM", pending: false, kind: "closure" });
    expect(trafficDetail(partlyRoad, [partial({ endsAt: "2026-10-17T13:00:00Z" })], now)).toBe("Partly closed · until 9 PM");
  });

  it("says partly closes for one still ahead", () => {
    expect(trafficStatus(partlyRoad, [partial({ startsAt: "2026-10-25T02:00:00Z", endsAt: "2026-10-25T13:00:00Z" })], now)).toMatchObject({ headline: "Partly closes Sun 25 Oct", pending: true });
  });

  it("draws a scheduled partial closure as partly closed, and a full one over it", () => {
    expect(mapAreas([], [partial()])).toEqual([expect.objectContaining({ area: "Digicast", level: "partial" })]);
    const full = item({ id: "full", category: "road_closure", area: "Digicast", publishedAt: "2026-10-17T00:00:00Z" });
    expect(mapAreas([], [partial(), full])[0].level).toBe("closed");
    expect(mapAreas([], [full, partial()])[0].level).toBe("closed");
  });

  it("puts a partly closed road between heavy and closed, worst first", () => {
    const rows = (["closed", "heavy", "partial", "clear"] as const).map((level) => ({ area: level, level, reports: 1, updatedAt: now.toISOString() }));
    expect(trafficAgenda(rows, [], now).live.map((r) => r.area.level)).toEqual(["closed", "partial", "heavy", "clear"]);
  });

  it("is a full closure on the card when the road also has one", () => {
    const area: TrafficArea = { ...partlyRoad, level: "closed" };
    expect(trafficStatus(area, [partial()], now).headline).toBe("Closed");
  });
});

describe("trafficStatus, daily closures", () => {
  // 3 PM to 3 AM, 1-25 Oct. `now` is 4:00 PM Oct 17, inside tonight's window.
  const daily = (over: Partial<FeedItem> = {}) => [item({ category: "road_closure", area: "Lacson St", publishedAt: now.toISOString(), startsAt: "2026-10-01T07:00:00Z", endsAt: "2026-10-25T10:00:00Z", dailyFrom: 900, dailyTo: 180, ...over })];
  const road = (level: TrafficArea["level"]): TrafficArea => ({ area: "Lacson St", level, reports: 1, updatedAt: now.toISOString() });

  it("says closed with the daily hours inside the window", () => {
    expect(trafficStatus(road("closed"), daily(), now)).toMatchObject({ headline: "Closed", hours: "daily 3 PM – 3 AM, until Sun 25 Oct", pending: false });
  });
  it("says it closes at the next window start, outside the window", () => {
    expect(trafficStatus(road("moderate"), daily(), new Date("2026-10-17T02:00:00Z"))).toMatchObject({ headline: "Closes 3:00 PM", pending: true, startsAt: "2026-10-17T07:00:00.000Z" });
    // A lunchtime window already over today opens again tomorrow.
    expect(trafficStatus(road("moderate"), daily({ dailyFrom: 540, dailyTo: 720 }), now)).toMatchObject({ headline: "Closes tomorrow 9:00 AM", pending: true });
  });
  it("words a partial one as partly closed", () => {
    expect(trafficStatus(road("partial"), daily({ closureExtent: "partial" }), now).headline).toBe("Partly closed");
  });
  it("stops being pending-only after the last night", () => {
    expect(trafficStatus(road("moderate"), daily(), new Date("2026-10-25T20:00:00Z"))).toMatchObject({ pending: false });
  });
});
