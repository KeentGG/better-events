import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import type { ScheduleEvent } from "./types";
import { venueMarks } from "./venueMarks";

const roads: FeatureCollection = { type: "FeatureCollection", features: [{ type: "Feature", properties: { area: "Lacson St" }, geometry: { type: "LineString", coordinates: [[0, 0], [2, 0]] } }] };
const now = Date.parse("2026-10-17T10:00:00Z");
const at = (h: number) => new Date(now + h * 3_600_000).toISOString();
const event = (over: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
  id: "e1", title: "Streetdance", kind: "parade", venue: "Araneta", startsAt: at(1), endsAt: at(4), status: "on_time", note: null, official: true, topics: [],
  venues: [{ venue: "Lacson St", area: "Lacson St", role: "route" }, { venue: "Paglaum Stadium", area: "Unmapped", role: "finish" }, { venue: "Plaza", role: "start" }],
  ...over,
});

describe("venueMarks", () => {
  it("marks an event starting within 3 hours, only where an area has geometry", () => {
    expect(venueMarks([event()], roads, now)).toEqual([{ text: "Streetdance: Route Lacson St", at: [1, 0] }]);
  });
  it("marks an event that is on now", () => {
    expect(venueMarks([event({ startsAt: at(-1), endsAt: at(1) })], roads, now)).toHaveLength(1);
  });
  it("leaves out events further off, finished, called off or without a time", () => {
    expect(venueMarks([event({ startsAt: at(3.5), endsAt: at(5) })], roads, now)).toEqual([]);
    expect(venueMarks([event({ startsAt: at(-5), endsAt: at(-3) })], roads, now)).toEqual([]);
    expect(venueMarks([event({ status: "cancelled" })], roads, now)).toEqual([]);
    expect(venueMarks([event({ timeKnown: false })], roads, now)).toEqual([]);
    expect(venueMarks([event({ venues: undefined })], roads, now)).toEqual([]);
  });
  it("marks a venue once across the nights of a series", () => {
    const night = (id: string) => event({ id, seriesId: "s1", startsAt: at(1) });
    expect(venueMarks([night("s1@a"), night("s1@b")], roads, now)).toHaveLength(1);
  });
});
