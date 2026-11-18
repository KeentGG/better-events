import { describe, expect, it } from "vitest";
import { recentResultEvents, scheduleResults, type VersionRow } from "./scheduleResults";

const v = (eventId: string | null, stage: string, hoursAgo: number, rows = [{ label: "1st", name: "A" }]): VersionRow => ({
  eventId,
  contest: "Street dance",
  stage,
  rows,
  expectedAt: stage === "pending" ? new Date("2026-10-13T02:00:00Z") : null,
  createdAt: new Date(Date.UTC(2026, 9, 12, 12) - hoursAgo * 3_600_000),
});

describe("scheduleResults", () => {
  it("uses the newest posted version", () => {
    const m = scheduleResults([v("e", "final", 5), v("e", "corrected", 1, [{ label: "1st", name: "B", was: "A" } as never])]);
    expect(m.get("e")?.results?.stage).toBe("corrected");
    expect(m.get("e")?.results?.rows[0].was).toBe("A");
    expect(m.get("e")?.resultsExpectedAt).toBeUndefined();
  });
  it("says when results are expected while the newest is pending", () => {
    const m = scheduleResults([v("e", "pending", 1)]);
    expect(m.get("e")?.results).toBeUndefined();
    expect(m.get("e")?.resultsExpectedAt).toBe("2026-10-13T02:00:00.000Z");
  });
  it("keeps the earlier standings behind a newer placeholder", () => {
    const m = scheduleResults([v("e", "standings", 5), v("e", "pending", 1)]);
    expect(m.get("e")?.results?.stage).toBe("standings");
    expect(m.get("e")?.resultsExpectedAt).toBeTruthy();
  });
  it("skips versions with no event", () => {
    expect(scheduleResults([v(null, "final", 1)]).size).toBe(0);
  });
});

describe("recentResultEvents", () => {
  it("lists events whose newest version is inside the window", () => {
    const since = new Date(Date.UTC(2026, 9, 12, 12) - 36 * 3_600_000);
    expect(recentResultEvents([v("a", "final", 40), v("a", "corrected", 2), v("b", "final", 50)], since)).toEqual(["a"]);
  });
});
