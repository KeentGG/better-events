import { describe, expect, it } from "vitest";
import { dayTime } from "./time";

// Feed cards say when something starts or ends, with the day only when it isn't today (Bacolod time).
describe("dayTime", () => {
  const now = new Date("2026-10-17T04:00:00Z"); // Sat 17 Oct, 12 PM in Bacolod

  it("gives only the time today", () => {
    expect(dayTime("2026-10-17T13:00:00Z", now)).toBe("9:00 PM");
  });

  it("says tomorrow for the next day, and the date after that", () => {
    expect(dayTime("2026-10-18T01:00:00Z", now)).toBe("tomorrow 9:00 AM");
    expect(dayTime("2026-10-20T13:00:00Z", now)).toBe("Tue 20 Oct, 9:00 PM");
  });
});
