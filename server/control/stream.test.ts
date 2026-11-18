import { describe, expect, it } from "vitest";
import { whereItWent } from "./stream";

// The stream's labels must land in the same buckets as the intake counts (docs/MISSION_CONTROL.md §4.4).
describe("whereItWent", () => {
  it("counts a published item as used", () => {
    expect(whereItWent("used", null, "published")).toEqual({ outcome: "used", reason: null });
  });

  it("keeps items waiting for review, and unclassified posts, pending", () => {
    expect(whereItWent("used", null, "needs_review")).toEqual({ outcome: "pending", reason: "Waiting for review" });
    expect(whereItWent(null, null, undefined)).toEqual({ outcome: "pending", reason: "Not classified yet" });
  });

  it("drops ignored posts and hidden items", () => {
    expect(whereItWent("ignored", "irrelevant", undefined)).toEqual({ outcome: "dropped", reason: "Ignored: irrelevant" });
    expect(whereItWent("used", null, "hidden")).toEqual({ outcome: "dropped", reason: "Hidden by staff" });
  });
});
