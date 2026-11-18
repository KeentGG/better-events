import { describe, expect, it } from "vitest";
import { TITLE_MAX } from "../../src/lib/headline";
import type { Times } from "../../src/lib/retime";
import { formerTimes } from "../app";
import { retimeBody } from "../team";
import { advisoryTitle, closureTitle, dailyAfterRetime, followUpSubject, followUpTitle, isRetimable, planRetime, retitled } from "./retime";

// Bacolod is UTC+8: 6 PM there is 10:00Z.
const at = (h: number, day = 17) => new Date(Date.UTC(2026, 9, day) + (h - 8) * 3_600_000);
const NOW = at(14);
const cur: Times = { startsAt: at(18), endsAt: at(21) };
const plan = (input: Parameters<typeof planRetime>[1], c = cur) => planRetime(c, input, NOW);

describe("planRetime wording", () => {
  it("extends and shortens the end", () => {
    expect(plan({ endsAt: at(22) })).toMatchObject({ line: "Extended until 10:00 PM", tier: 1 });
    expect(plan({ endsAt: at(21.5) })).toMatchObject({ line: "Extended until 9:30 PM", tier: 0 });
    expect(plan({ endsAt: at(17) })).toMatchObject({ error: "The end is before the start." });
    expect(plan({ endsAt: at(20) })).toMatchObject({ line: "Now ends at 8:00 PM", tier: 1 });
    expect(plan({ endsAt: at(20.5) })).toMatchObject({ line: "Now ends at 8:30 PM", tier: 0 });
  });
  it("moves the start later, earlier, or to another day", () => {
    expect(plan({ startsAt: at(19) })).toMatchObject({ line: "Starts later, at 7:00 PM", tier: 1 });
    expect(plan({ startsAt: at(18.5) })).toMatchObject({ line: "Starts later, at 6:30 PM", tier: 0 });
    expect(plan({ startsAt: at(16) })).toMatchObject({ line: "Starts earlier, 4:00 PM", tier: 1 });
    expect(plan({ startsAt: at(18, 18), endsAt: at(21, 18) })).toMatchObject({ line: "Moved to Sun 18 Oct", tier: 1 });
  });
  it("names an end added where there was none, and a cleared one", () => {
    expect(plan({ endsAt: at(21) }, { startsAt: at(18), endsAt: null })).toMatchObject({ line: "Until 9:00 PM", tier: 0 });
    expect(plan({ endsAt: null })).toMatchObject({ line: "No set end", tier: 0 });
  });
  it("measures a first start from today", () => {
    expect(plan({ startsAt: at(19) }, { startsAt: null, endsAt: at(21) })).toMatchObject({ line: "Starts at 7:00 PM", tier: 0 });
    expect(plan({ startsAt: at(8, 19), endsAt: at(20, 19) }, { startsAt: null, endsAt: at(21) })).toMatchObject({ line: "Moved to Mon 19 Oct", tier: 1 });
  });
  it("reads the start, then the end, when both change", () => {
    expect(plan({ startsAt: at(19), endsAt: at(22) })).toMatchObject({ line: "Starts later, at 7:00 PM, Extended until 10:00 PM", tier: 1 });
  });
  it("shows the day on an end that lands on another one", () => {
    expect(plan({ endsAt: at(1, 18) })).toMatchObject({ line: "Extended until Sun 18 Oct, 1:00 AM" });
  });
});

describe("planRetime refusals", () => {
  it("refuses no change, an end before the start, and an end already past", () => {
    expect(plan({})).toHaveProperty("error");
    expect(plan({ startsAt: cur.startsAt!, endsAt: cur.endsAt })).toHaveProperty("error");
    expect(plan({ startsAt: at(22) })).toMatchObject({ error: "The end is before the start." });
    expect(planRetime({ startsAt: at(8), endsAt: at(21) }, { endsAt: at(13) }, NOW)).toMatchObject({ error: expect.stringContaining("already passed") });
  });
});

describe("headlines", () => {
  it("rebuilds advisory and closure titles with the same builders the post used", () => {
    expect(advisoryTitle("Lacson St", at(18), at(21))).toBe("Traffic advisory: Lacson St from 6:00 PM until 9:00 PM");
    expect(closureTitle("Lacson St", at(18), at(21))).toBe("Closed: Lacson St from 6:00 PM until 9:00 PM");
    expect(retitled("road_closure", "old", "Lacson St", at(19), at(21))).toBe("Closed: Lacson St from 7:00 PM until 9:00 PM");
    expect(retitled("traffic_advisory", "old", "Lacson St", null, at(21))).toBe("Traffic advisory: Lacson St until 9:00 PM");
  });
  it("titles a partial closure as partly closed, and keeps that through a retime", () => {
    expect(closureTitle("Lacson St", null, at(21), "partial")).toBe("Partly closed: Lacson St until 9:00 PM");
    expect(closureTitle("Lacson St", null, at(21), null)).toBe("Closed: Lacson St until 9:00 PM");
    expect(retitled("road_closure", "old", "Lacson St", at(19), at(22), "partial")).toBe("Partly closed: Lacson St from 7:00 PM until 10:00 PM");
    expect(followUpSubject("road_closure", "x", "Lacson St", "partial")).toBe("Partly closed, Lacson St");
    expect(followUpSubject("road_closure", "x", "Lacson St")).toBe("Closed, Lacson St");
  });
  it("words a daily closure with its hours and last day, through a retime too", () => {
    const start = new Date("2026-10-19T07:00:00Z");
    const end = new Date("2026-10-25T10:00:00Z");
    const daily = { from: 15 * 60, to: 3 * 60 };
    expect(closureTitle("Lacson St", start, end, null, daily)).toBe("Closed daily 3:00 PM–3:00 AM: Lacson St until Sun 25 Oct");
    expect(closureTitle("Lacson St", start, end, "partial", daily)).toBe("Partly closed daily 3:00 PM–3:00 AM: Lacson St until Sun 25 Oct");
    expect(retitled("road_closure", "old", "Lacson St", start, new Date("2026-10-26T10:00:00Z"), null, daily)).toBe("Closed daily 3:00 PM–3:00 AM: Lacson St until Mon 26 Oct");
    expect(retitled("road_closure", "old", "Lacson St", start, end, null, null)).toContain("Closed: Lacson St from");
    expect(followUpSubject("road_closure", "x", "Lacson St", null, true)).toBe("Closed daily, Lacson St");
  });
  it("leaves a notice's free-text title alone", () => {
    expect(retitled("promo", "Piaya promo", "Lacson St", at(19), at(21))).toBe("Piaya promo");
  });
  it("titles the follow-up from the change, fit to the cap", () => {
    expect(followUpTitle("Extended until 9:00 PM", followUpSubject("traffic_advisory", "x", "Lacson St")).title).toBe("Extended until 9:00 PM: Traffic advisory, Lacson St");
    const long = followUpTitle("Extended until 9:00 PM", "Free piaya ".repeat(20).trim(), "Bring a bag");
    expect(long.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(long.body).toContain("Bring a bag");
  });
  it("covers the categories that carry times", () => {
    for (const c of ["traffic_advisory", "road_closure", "promo", "crime_safety", "weather"] as const) expect(isRetimable(c)).toBe(true);
    for (const c of ["winner", "schedule_change"] as const) expect(isRetimable(c)).toBe(false);
  });
});

describe("retime request", () => {
  const ok = (b: unknown) => retimeBody.safeParse(b);
  it("needs a start or an end, announces by default, and caps the note", () => {
    expect(ok({}).success).toBe(false);
    const r = ok({ endsAt: "2026-10-17T13:00:00Z" });
    expect(r.success && r.data.announce).toBe(true);
    expect(ok({ endsAt: null }).success).toBe(true);
    expect(ok({ startsAt: "2026-10-17T13:00:00Z", note: "x".repeat(201) }).success).toBe(false);
    expect(ok({ startsAt: "2026-10-17T13:00:00Z", tier: 3 }).success).toBe(false);
    expect(ok({ startsAt: "soon" }).success).toBe(false);
  });
});

describe("what readers see after a retime", () => {
  const first = { startsAt: at(18), endsAt: at(21) };
  it("shows nothing for a post that was never retimed", () => {
    expect(formerTimes({ ...first, originalStartsAt: null, originalEndsAt: null, timeChange: null })).toEqual({});
  });
  it("keeps only the times that differ, and the wording", () => {
    expect(formerTimes({ startsAt: at(18), endsAt: at(22), originalStartsAt: at(18), originalEndsAt: at(21), timeChange: "Extended until 10:00 PM" })).toEqual({
      formerStartsAt: null,
      formerEndsAt: at(21).toISOString(),
      timeChange: "Extended until 10:00 PM",
    });
  });
  it("treats an end that was added as a change with no former end, and a return to the first times as none", () => {
    expect(formerTimes({ startsAt: at(18), endsAt: at(21), originalStartsAt: at(18), originalEndsAt: null, timeChange: "Until 9:00 PM" })).toMatchObject({ formerEndsAt: null, timeChange: "Until 9:00 PM" });
    expect(formerTimes({ ...first, originalStartsAt: at(18), originalEndsAt: at(21), timeChange: "Now ends at 9:00 PM" })).toEqual({});
  });
});

describe("a retimed closure on the map", () => {
  it("reads the closure's own times, which a retime updates", () => {
    // /api/traffic closes a road while starts_at <= now and ends_at >= now; the retime writes both columns, so a
    // closure moved to another day stops closing the road today. The overlay is checked live in the PR notes.
    const planned = planRetime({ startsAt: at(8), endsAt: at(20) }, { startsAt: at(8, 18), endsAt: at(20, 18) }, NOW);
    expect(planned).toMatchObject({ startsAt: at(8, 18), endsAt: at(20, 18), line: "Moved to Sun 18 Oct", tier: 1 });
  });
});

describe("daily hours through a retime", () => {
  const day = (iso: string) => new Date(iso);
  const night = { from: 15 * 60, to: 3 * 60 };
  it("keeps them while the new range still spans days", () => {
    expect(dailyAfterRetime(900, 180, day("2026-10-19T07:00:00Z"), day("2026-10-26T10:00:00Z"))).toEqual(night);
  });
  it("drops them when the new range falls within one day", () => {
    expect(dailyAfterRetime(900, 180, day("2026-10-19T02:00:00Z"), day("2026-10-19T10:00:00Z"))).toBeNull();
  });
  it("drops them when the range loses its start or end", () => {
    expect(dailyAfterRetime(900, 180, null, day("2026-10-26T10:00:00Z"))).toBeNull();
    expect(dailyAfterRetime(900, 180, day("2026-10-19T07:00:00Z"), null)).toBeNull();
  });
  it("has nothing to keep on a post without daily hours", () => {
    expect(dailyAfterRetime(null, null, day("2026-10-19T07:00:00Z"), day("2026-10-26T10:00:00Z"))).toBeNull();
  });
});
