import { describe, expect, it } from "vitest";
import { splitTop } from "./tiers";

// /api/feed/top: rows come newest first; the Now page shows one banner and up to three pins.
describe("splitTop", () => {
  const row = (id: string, severity: number) => ({ id, severity });

  it("puts the newest hero in the banner and pins in order", () => {
    expect(splitTop([row("p1", 1), row("h1", 2), row("p2", 1)])).toEqual({ hero: row("h1", 2), pins: [row("p1", 1), row("p2", 1)] });
  });

  it("shows only the newest three pins", () => {
    const pins = ["a", "b", "c", "d"].map((id) => row(id, 1));
    expect(splitTop(pins).pins.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("shows an older hero as a pin rather than dropping it", () => {
    expect(splitTop([row("new", 2), row("old", 2)])).toEqual({ hero: row("new", 2), pins: [row("old", 2)] });
  });

  it("leaves feed items out, and has no banner when there is none", () => {
    expect(splitTop([row("f", 0)])).toEqual({ hero: null, pins: [] });
  });
});
