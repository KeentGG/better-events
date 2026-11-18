import { describe, expect, it } from "vitest";
import { INTAKE_FILTERS, matchesIntakeFilter, type ControlPost, type IntakeFilter } from "./types";

type Row = Pick<ControlPost, "outcome" | "item">;
const item = (status: "published" | "needs_review" | "hidden", flag: "conflict" | null = null): ControlPost["item"] => ({
  id: "i1",
  category: "road_closure",
  title: "Closed: Lacson St",
  area: "Lacson St",
  status,
  flag,
  verifiedAt: null,
});

const rows: Record<string, Row> = {
  published: { outcome: "used", item: item("published") },
  flaggedPublished: { outcome: "used", item: item("published", "conflict") },
  review: { outcome: "pending", item: item("needs_review") },
  unclassified: { outcome: "pending", item: null },
  hidden: { outcome: "dropped", item: item("hidden") },
  hiddenFlagged: { outcome: "dropped", item: item("hidden", "conflict") },
  ignored: { outcome: "dropped", item: null },
};

const under = (filter: IntakeFilter) => Object.keys(rows).filter((k) => matchesIntakeFilter(rows[k], filter));

// The intake table's filters, which the server's query mirrors (server/control/stream.ts).
describe("matchesIntakeFilter", () => {
  it("keeps everything but dropped rows open", () => {
    expect(under("open")).toEqual(["published", "flaggedPublished", "review", "unclassified"]);
  });

  it("asks staff to verify what waits for review or carries a flag and is still up", () => {
    expect(under("verify")).toEqual(["flaggedPublished", "review"]);
  });

  it("lists open flags only, not flags on hidden items", () => {
    expect(under("flagged")).toEqual(["flaggedPublished"]);
  });

  it("splits published from dropped", () => {
    expect(under("published")).toEqual(["published", "flaggedPublished"]);
    expect(under("dropped")).toEqual(["hidden", "hiddenFlagged", "ignored"]);
  });

  it("puts every row under open or dropped, never both", () => {
    for (const row of Object.values(rows)) expect(matchesIntakeFilter(row, "open")).not.toBe(matchesIntakeFilter(row, "dropped"));
    expect(INTAKE_FILTERS[0]).toBe("open");
  });
});
