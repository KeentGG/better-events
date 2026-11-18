import { describe, expect, it } from "vitest";
import { claimedCategory, findConflict, flagFor, type NewItem, type OfficialUpdate } from "./flags";

const NOW = new Date("2026-10-20T12:00:00Z");
const LACSON = "area-lacson";
const crowd = (over: Partial<NewItem>): NewItem => ({ category: "traffic_sentiment", confidence: 0.9, areaId: LACSON, text: "", official: false, ...over });
const closure: OfficialUpdate = { id: "item-closure", category: "road_closure", areaId: LACSON, endsAt: null };

describe("flagFor", () => {
  it("never flags an official item", () => {
    expect(flagFor(crowd({ official: true, category: "road_reopening", confidence: 0.1 }), [closure], NOW)).toBeNull();
  });

  it("flags a crowd post saying a road is open while an official closure is active", () => {
    expect(flagFor(crowd({ category: "other", text: "lacson open na ya" }), [closure], NOW)).toBe("conflict");
    expect(flagFor(crowd({ category: "road_reopening" }), [closure], NOW)).toBe("conflict");
  });

  it("does not see a conflict once the closure has ended, or on another road", () => {
    const ended = { ...closure, endsAt: new Date("2026-10-20T11:00:00Z") };
    expect(flagFor(crowd({ text: "lacson open na" }), [ended], NOW)).toBeNull();
    expect(flagFor(crowd({ text: "open na", areaId: "area-araneta" }), [closure], NOW)).toBeNull();
  });

  it("flags a crowd closure against an official reopening", () => {
    expect(flagFor(crowd({ category: "road_closure" }), [{ id: "item-reopening", category: "road_reopening", areaId: LACSON, endsAt: null }], NOW)).toBe("conflict");
  });

  it("flags unverified high-stakes posts, then low confidence", () => {
    expect(flagFor(crowd({ category: "cancellation", areaId: null }), [], NOW)).toBe("unverified_high_stakes");
    expect(flagFor(crowd({ category: "crime_safety", confidence: 0.3 }), [], NOW)).toBe("unverified_high_stakes");
    expect(flagFor(crowd({ confidence: 0.5 }), [], NOW)).toBe("low_confidence");
    expect(flagFor(crowd({ confidence: 0.6 }), [], NOW)).toBeNull();
  });
});

describe("claimedCategory", () => {
  it("files a post contradicting a closure as a reopening claim", () => {
    expect(claimedCategory(crowd({ category: "other", text: "lacson open na" }), [closure], NOW)).toBe("road_reopening");
  });

  it("leaves other items alone", () => {
    expect(claimedCategory(crowd({ category: "traffic_sentiment", text: "heavy traffic" }), [closure], NOW)).toBe("traffic_sentiment");
    expect(claimedCategory(crowd({ official: true, category: "other", text: "open" }), [closure], NOW)).toBe("other");
  });
});

describe("findConflict", () => {
  const ended = { ...closure, id: "item-ended", endsAt: new Date("2026-10-20T11:00:00Z") };

  it("returns the official update a post contradicts, to store as its conflict", () => {
    expect(findConflict(crowd({ text: "lacson open na" }), [ended, closure], NOW)).toBe(closure);
  });

  it("finds nothing for official items, items with no area, or posts that agree", () => {
    expect(findConflict(crowd({ official: true, text: "open" }), [closure], NOW)).toBeUndefined();
    expect(findConflict(crowd({ areaId: null, text: "open" }), [closure], NOW)).toBeUndefined();
    expect(findConflict(crowd({ category: "road_closure", text: "sarado gihapon" }), [closure], NOW)).toBeUndefined();
  });
});
