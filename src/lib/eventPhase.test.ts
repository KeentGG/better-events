import { describe, expect, it } from "vitest";
import { type EventPhase, hasResults, manilaMidnight, phaseOf, railOrder } from "./eventPhase";
import { eventTime, eventWhen } from "./time";

// An all-day or time-to-follow event holds its date at 00:00 in Bacolod (16:00 UTC the day before).
const base = { status: "on_time" as const, endsAt: null, actualStart: null, actualEnd: null };
const day = { ...base, startsAt: "2026-10-16T16:00:00Z" }; // Sat 17 Oct 00:00 in Bacolod
const at = (iso: string) => Date.parse(iso);

describe("phaseOf for dates without a time", () => {
  it("never calls a time-to-follow event live, until the team marks it started", () => {
    const tba = { ...day, timeKnown: false };
    expect(phaseOf(tba, at("2026-10-17T04:00:00Z"))).toBe("next");
    expect(phaseOf({ ...tba, actualStart: "2026-10-17T05:00:00Z" }, at("2026-10-17T06:00:00Z"))).toBe("live");
  });

  it("calls an all-day event on only in the daytime of its date", () => {
    const allDay = { ...day, allDay: true };
    expect(phaseOf(allDay, at("2026-10-16T16:30:00Z"))).toBe("next"); // 12:30 AM
    expect(phaseOf(allDay, at("2026-10-17T04:00:00Z"))).toBe("live"); // noon
    expect(phaseOf(allDay, at("2026-10-17T15:00:00Z"))).toBe("next"); // 11 PM, after hours
  });

  it("is done once its date is over", () => {
    expect(phaseOf({ ...day, allDay: true }, at("2026-10-17T16:00:00Z"))).toBe("done");
    expect(phaseOf({ ...day, timeKnown: false }, at("2026-10-18T04:00:00Z"))).toBe("done");
  });

  it("still lets a cancelled one say so", () => {
    expect(phaseOf({ ...day, allDay: true, status: "cancelled" }, at("2026-10-17T04:00:00Z"))).toBe("cancelled");
  });

  it("leaves timed events as they were", () => {
    const timed = { ...base, startsAt: "2026-10-17T10:00:00Z", endsAt: "2026-10-17T12:00:00Z", timeKnown: true, allDay: false };
    expect(phaseOf(timed, at("2026-10-17T11:00:00Z"))).toBe("live");
    expect(phaseOf(timed, at("2026-10-17T12:00:00Z"))).toBe("done");
  });
});

describe("what readers see instead of a clock", () => {
  it("finds Bacolod midnight", () => {
    expect(new Date(manilaMidnight("2026-10-17T10:00:00Z")).toISOString()).toBe("2026-10-16T16:00:00.000Z");
    expect(new Date(manilaMidnight("2026-10-16T16:00:00Z")).toISOString()).toBe("2026-10-16T16:00:00.000Z");
  });

  it("says All day or Time to follow", () => {
    expect(eventTime({ startsAt: day.startsAt, endsAt: null, allDay: true })).toBe("All day");
    expect(eventTime({ startsAt: day.startsAt, endsAt: null, timeKnown: false })).toBe("Time to follow");
    expect(eventTime({ startsAt: "2026-10-17T13:00:00Z", endsAt: null })).toBe("9:00 PM");
  });

  it("words the feed headline's when", () => {
    const now = new Date("2026-10-17T04:00:00Z");
    expect(eventWhen({ startsAt: day.startsAt, allDay: true }, now)).toBe("today, all day");
    expect(eventWhen({ startsAt: "2026-10-19T16:00:00Z", timeKnown: false }, now)).toBe("Tue 20 Oct, time to follow");
  });
});

describe("railOrder", () => {
  const now = at("2026-10-17T10:00:00Z"); // 6 PM in Bacolod
  const ev = (id: string, startsAt: string, over: object = {}) => ({ id, event: { ...base, startsAt, ...over } as never, phase: "next" as EventPhase });
  it("puts finished events apart and time-to-follow at the end of the day", () => {
    const items = [
      { ...ev("tbf", "2026-10-16T16:00:00Z", { timeKnown: false }) },
      { ...ev("done", "2026-10-17T02:00:00Z"), phase: "done" as EventPhase },
      { ...ev("late", "2026-10-17T13:00:00Z") },
      { ...ev("soon", "2026-10-17T11:00:00Z") },
      { ...ev("offPast", "2026-10-17T03:00:00Z"), phase: "cancelled" as EventPhase },
      { ...ev("offAhead", "2026-10-17T12:00:00Z"), phase: "cancelled" as EventPhase },
    ];
    const { earlier, ahead } = railOrder(items, now);
    expect(earlier.map((i) => i.id)).toEqual(["done", "offPast"]);
    expect(ahead.map((i) => i.id)).toEqual(["soon", "offAhead", "late", "tbf"]);
  });
});

describe("done status and results", () => {
  it("treats status done as over", () => {
    const e = { status: "done" as const, startsAt: new Date(Date.now() + 3_600_000).toISOString(), endsAt: null };
    expect(phaseOf(e)).toBe("done");
  });
  it("sees results or a pending time", () => {
    expect(hasResults({})).toBe(false);
    expect(hasResults({ resultsExpectedAt: "2026-10-13T00:00:00Z" })).toBe(true);
    expect(hasResults({ results: { contest: "x", stage: "final", rows: [], postedAt: "" } })).toBe(true);
  });
});
