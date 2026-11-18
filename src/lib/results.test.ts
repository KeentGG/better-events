import { describe, expect, it } from "vitest";
import { rowChanged, topRows } from "./results";

const rows = ["a", "b", "c", "d", "e"].map((name, i) => ({ label: `${i + 1}`, name }));

describe("topRows", () => {
  it("keeps the first three and counts the rest", () => {
    expect(topRows(rows).shown.map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(topRows(rows).more).toBe(2);
  });
  it("has nothing left behind for a short list", () => {
    expect(topRows(rows.slice(0, 2))).toEqual({ shown: rows.slice(0, 2), more: 0 });
  });
});

describe("rowChanged", () => {
  it("is true only when the name differs from was", () => {
    expect(rowChanged({ label: "1st", name: "B", was: "A" })).toBe(true);
    expect(rowChanged({ label: "1st", name: "B" })).toBe(false);
    expect(rowChanged({ label: "1st", name: "B", was: "B" })).toBe(false);
  });
});
