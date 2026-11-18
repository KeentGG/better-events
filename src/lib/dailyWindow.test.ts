import { describe, expect, it } from "vitest";
import { clockOfMinutes, dailyHours, dailyLine, dailyProblem, minutesOfDay, nextWindowStart, onNow, rangeLine } from "./dailyWindow";

const at = (iso: string) => Date.parse(iso);
const night = { startsAt: "2026-10-01T17:00:00+08:00", endsAt: "2026-10-31T02:00:00+08:00", dailyFrom: 17 * 60, dailyTo: 2 * 60 };

describe("minutesOfDay and wording", () => {
  it("reads Manila minutes after midnight", () => {
    expect(minutesOfDay(at("2026-10-05T17:30:00+08:00"))).toBe(17 * 60 + 30);
    expect(minutesOfDay(at("2026-10-05T00:00:00+08:00"))).toBe(0);
    expect(minutesOfDay(at("2026-10-04T16:00:00Z"))).toBe(0);
  });
  it("words hours", () => {
    expect(clockOfMinutes(0)).toBe("12:00 AM");
    expect(clockOfMinutes(12 * 60)).toBe("12:00 PM");
    expect(clockOfMinutes(17 * 60 + 5)).toBe("5:05 PM");
    expect(dailyHours(17 * 60, 2 * 60)).toBe("5:00 PM–2:00 AM");
  });
  it("words the range as daily when it has hours", () => {
    expect(dailyLine(night)).toBe("Daily 5:00 PM–2:00 AM until Sat 31 Oct");
    expect(dailyLine({ startsAt: night.startsAt, endsAt: night.endsAt })).toBeNull();
    expect(rangeLine(night)).toBe("Daily 5:00 PM–2:00 AM until Sat 31 Oct");
    expect(rangeLine({ startsAt: null, endsAt: "2026-10-31T02:00:00+08:00" }, new Date("2026-10-30T00:00:00+08:00"))).toMatch(/^Until /);
  });
});

describe("dailyProblem", () => {
  const s = "2026-10-01T17:00:00+08:00";
  const e = "2026-10-31T02:00:00+08:00";
  it("accepts both hours on a range across days, or neither", () => {
    expect(dailyProblem(s, e, 1020, 120)).toBeNull();
    expect(dailyProblem(s, e, null, null)).toBeNull();
    expect(dailyProblem(undefined, undefined, undefined, undefined)).toBeNull();
  });
  it("refuses one without the other", () => {
    expect(dailyProblem(s, e, 1020, undefined)).toMatch(/both/);
    expect(dailyProblem(s, e, null, 120)).toMatch(/both/);
  });
  it("refuses out-of-range or equal hours", () => {
    expect(dailyProblem(s, e, -1, 120)).toMatch(/0 to 1439/);
    expect(dailyProblem(s, e, 1020, 1440)).toMatch(/0 to 1439/);
    expect(dailyProblem(s, e, 600, 600)).toMatch(/same/);
  });
  it("needs a start and an end on a later day", () => {
    expect(dailyProblem(s, undefined, 1020, 120)).toMatch(/start and an end/);
    expect(dailyProblem(undefined, e, 1020, 120)).toMatch(/start and an end/);
    expect(dailyProblem(s, "2026-10-01T23:00:00+08:00", 1020, 120)).toMatch(/later day/);
    // 11 PM to 1 AM across midnight is a later day.
    expect(dailyProblem(s, "2026-10-02T01:00:00+08:00", 1020, 120)).toBeNull();
    // Manila days, not UTC: 5 PM and 11 PM on the 1st are both the 1st in Manila.
    expect(dailyProblem("2026-10-01T09:00:00Z", "2026-10-01T15:00:00Z", 1020, 120)).toMatch(/later day/);
  });
});

describe("onNow", () => {
  it("is on inside the daily hours, past midnight too, and off outside them", () => {
    expect(onNow(night, at("2026-10-15T10:00:00+08:00"))).toBe(false);
    expect(onNow(night, at("2026-10-15T16:59:00+08:00"))).toBe(false);
    expect(onNow(night, at("2026-10-15T17:00:00+08:00"))).toBe(true);
    expect(onNow(night, at("2026-10-15T23:59:00+08:00"))).toBe(true);
    expect(onNow(night, at("2026-10-16T01:59:00+08:00"))).toBe(true);
    expect(onNow(night, at("2026-10-16T02:00:00+08:00"))).toBe(false);
  });
  it("handles hours within one day", () => {
    const lunch = { startsAt: "2026-10-01T00:00:00+08:00", endsAt: "2026-10-05T00:00:00+08:00", dailyFrom: 11 * 60, dailyTo: 14 * 60 };
    expect(onNow(lunch, at("2026-10-02T12:00:00+08:00"))).toBe(true);
    expect(onNow(lunch, at("2026-10-02T14:00:00+08:00"))).toBe(false);
    expect(onNow(lunch, at("2026-10-02T10:59:00+08:00"))).toBe(false);
  });
  it("is off before the range starts and after it ends, whatever the hour", () => {
    expect(onNow(night, at("2026-09-30T20:00:00+08:00"))).toBe(false);
    expect(onNow(night, at("2026-10-31T20:00:00+08:00"))).toBe(false);
  });
  it("is just the range without daily hours", () => {
    const plain = { startsAt: night.startsAt, endsAt: night.endsAt };
    expect(onNow(plain, at("2026-10-15T10:00:00+08:00"))).toBe(true);
    expect(onNow({ startsAt: null, endsAt: null }, at("2026-10-15T10:00:00+08:00"))).toBe(true);
    expect(onNow({ startsAt: "2026-10-20T10:00:00+08:00", endsAt: null }, at("2026-10-15T10:00:00+08:00"))).toBe(false);
  });
});

describe("nextWindowStart", () => {
  const night = { startsAt: "2026-10-01T00:00:00+08:00", endsAt: "2026-10-18T23:00:00+08:00", dailyFrom: 15 * 60, dailyTo: 3 * 60 };
  const next = (s: string, item = night) => nextWindowStart(item, Date.parse(s));
  it("is later today when the window has not opened", () => {
    expect(next("2026-10-05T10:00:00+08:00")).toBe("2026-10-05T07:00:00.000Z");
  });
  it("is tomorrow once today's window has opened", () => {
    expect(next("2026-10-05T16:00:00+08:00")).toBe("2026-10-06T07:00:00.000Z");
    expect(next("2026-10-05T15:00:00+08:00")).toBe("2026-10-06T07:00:00.000Z");
  });
  it("is null after the last window or without daily hours", () => {
    expect(next("2026-10-18T16:00:00+08:00")).toBeNull();
    expect(nextWindowStart({ startsAt: null, endsAt: null }, 0)).toBeNull();
  });
});
