import { describe, expect, it } from "vitest";
import { splitDays } from "./scheduleDays";

const base = { status: "on_time" as const, endsAt: null, actualStart: null, actualEnd: null, allDay: false, timeKnown: true };
// Times in Bacolod (UTC+8): yesterday 11:30 PM to today 2:00 AM is still running at 1:00 AM today.
const lateNight = { ...base, id: "late", startsAt: "2026-10-10T15:30:00Z", endsAt: "2026-10-10T18:00:00Z" };
const finished = { ...base, id: "done", startsAt: "2026-10-09T10:00:00Z", endsAt: "2026-10-09T11:00:00Z" };
const today = { ...base, id: "today", startsAt: "2026-10-11T02:00:00Z", endsAt: "2026-10-11T03:00:00Z" };
const now = Date.parse("2026-10-10T17:00:00Z"); // 1:00 AM, 11 Oct in Bacolod

describe("splitDays", () => {
  it("keeps a day before today in upcoming while one of its events is live", () => {
    const days: [string, typeof lateNight[]][] = [["2026-10-10", [lateNight]], ["2026-10-11", [today]]];
    const { past, upcoming } = splitDays(days, "2026-10-11", now);
    expect(past).toEqual([]);
    expect(upcoming).toEqual([[lateNight], [today]]);
  });

  it("folds a day before today with only finished events", () => {
    const days: [string, typeof finished[]][] = [["2026-10-09", [finished]], ["2026-10-11", [today]]];
    const { past, upcoming } = splitDays(days, "2026-10-11", now);
    expect(past).toEqual([[finished]]);
    expect(upcoming).toEqual([[today]]);
  });

  it("keeps today and later days in upcoming", () => {
    const later = { ...today, id: "later", startsAt: "2026-10-12T04:00:00Z" };
    const days: [string, typeof today[]][] = [["2026-10-11", [today]], ["2026-10-12", [later]]];
    const { past, upcoming } = splitDays(days, "2026-10-11", now);
    expect(past).toEqual([]);
    expect(upcoming).toEqual([[today], [later]]);
  });
});
