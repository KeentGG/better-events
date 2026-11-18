import { describe, expect, it } from "vitest";
import { crowdByLevel, crowdTooOld, liveCrowd, READING_FADE_MS, type CrowdReading } from "./crowd";

const now = new Date("2026-10-14T20:00:00+08:00");
const ago = (min: number) => new Date(now.getTime() - min * 60_000);
const reading = (area: string, level: string, min: number, extra: Partial<CrowdReading> = {}): CrowdReading => ({ area, level, at: ago(min), ...extra });

describe("liveCrowd", () => {
  it("keeps the newest reading per area, whatever order they come in", () => {
    const out = liveCrowd([reading("Plaza", "quiet", 40), reading("Plaza", "packed", 5), reading("Plaza", "busy", 20)], now);
    expect(out).toEqual([{ area: "Plaza", level: "packed", updatedAt: ago(5).toISOString() }]);
  });

  it("drops an area whose newest reading is 90 minutes old or more", () => {
    expect(liveCrowd([reading("Plaza", "packed", 89)], now)).toHaveLength(1);
    expect(liveCrowd([reading("Plaza", "packed", 90)], now)).toHaveLength(0);
    expect(READING_FADE_MS).toBe(90 * 60_000);
  });

  it("does not bring back an older reading once the newest one is quiet", () => {
    expect(liveCrowd([reading("Plaza", "packed", 80), reading("Plaza", "quiet", 10)], now)[0].level).toBe("quiet");
  });

  it("carries the note and the coordinates when there are some", () => {
    const [r] = liveCrowd([reading("Plaza", "busy", 5, { note: "Line at the gate", lat: 10.67, lng: 122.95 })], now);
    expect(r).toMatchObject({ note: "Line at the gate", lat: 10.67, lng: 122.95 });
    expect(liveCrowd([reading("Lacson", "busy", 5, { note: "", lat: null, lng: null })], now)[0]).not.toHaveProperty("lat");
  });

  it("ignores a level it does not know", () => {
    expect(liveCrowd([reading("Plaza", "jammed", 5)], now)).toEqual([]);
  });
});

describe("crowdByLevel", () => {
  it("puts packed first, then busy, then quiet", () => {
    const list = liveCrowd([reading("A", "quiet", 1), reading("B", "packed", 9), reading("C", "busy", 2), reading("D", "packed", 3)], now);
    expect(crowdByLevel(list).map((a) => a.area)).toEqual(["D", "B", "C", "A"]);
  });
});

describe("crowdTooOld", () => {
  it("allows 45 minutes and refuses more", () => {
    expect(crowdTooOld(ago(45), now)).toBe(false);
    expect(crowdTooOld(ago(46), now)).toBe(true);
  });
});
