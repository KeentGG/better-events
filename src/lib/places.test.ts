import { describe, expect, it } from "vitest";
import { closedLabel, isClosedNow, whereLine } from "./places";

describe("whereLine", () => {
  it("puts the area before directions that don't name it", () => {
    expect(whereLine("Near the stage", "Bacolod Government Center")).toBe("Bacolod Government Center · Near the stage");
  });

  it("keeps directions that already name the area, in any case", () => {
    expect(whereLine("Public Plaza, near the stage", "Public Plaza")).toBe("Public Plaza, near the stage");
    expect(whereLine("beside the public plaza fountain", "Public Plaza")).toBe("beside the public plaza fountain");
  });

  it("falls back to whichever one there is", () => {
    expect(whereLine("Near the stage", null)).toBe("Near the stage");
    expect(whereLine("", "Lacson St")).toBe("Lacson St");
    expect(whereLine(null, undefined)).toBe("");
  });
});

describe("closed until", () => {
  const now = new Date("2026-10-17T10:00:00+08:00");
  it("is closed only while the time is still ahead", () => {
    expect(isClosedNow("2026-10-17T18:00:00+08:00", now)).toBe(true);
    expect(isClosedNow("2026-10-17T09:00:00+08:00", now)).toBe(false);
    expect(isClosedNow(null, now)).toBe(false);
    expect(isClosedNow(undefined, now)).toBe(false);
  });
  it("names the time, with the weekday when it isn't today", () => {
    expect(closedLabel("2026-10-17T18:00:00+08:00", now)).toBe("Closed until 6:00 PM");
    expect(closedLabel("2026-10-24T18:00:00+08:00", now)).toBe("Closed until Sat 6:00 PM");
  });
});
