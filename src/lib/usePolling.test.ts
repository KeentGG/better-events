import { describe, expect, it } from "vitest";
import { keep } from "./usePolling";

describe("keep", () => {
  it("takes the next value when there is nothing before", () => {
    expect(keep(null, { live: false, data: 1 })).toEqual({ live: false, data: 1 });
  });

  it("does not replace live data with a fallback", () => {
    const live = { live: true, data: "real" };
    expect(keep(live, { live: false, data: "sample" })).toBe(live);
  });

  it("takes a newer live value over an older live one", () => {
    const next = { live: true, data: "newer" };
    expect(keep({ live: true, data: "older" }, next)).toBe(next);
  });

  it("lets a fallback replace a fallback", () => {
    const next = { live: false, data: "sample2" };
    expect(keep({ live: false, data: "sample" }, next)).toBe(next);
  });

  it("treats values without a live flag as live", () => {
    const next = [1, 2];
    expect(keep([0], next)).toBe(next);
  });
});
