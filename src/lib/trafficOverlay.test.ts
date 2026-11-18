import { describe, expect, it } from "vitest";
import type { TrafficArea } from "./types";
import { overlayClosures } from "./trafficOverlay";

const reading = (area: string, level: TrafficArea["level"], reports = 2): [string, TrafficArea] => [area, { area, level, reports, updatedAt: "2026-10-17T08:00:00.000Z" }];
const at = (h: number) => new Date(`2026-10-17T${String(h).padStart(2, "0")}:00:00Z`);

describe("overlayClosures", () => {
  it("shows a road with only a partial closure as partly closed, over its reading", () => {
    const out = overlayClosures(new Map([reading("Digicast", "heavy")]), [{ area: "Digicast", publishedAt: at(9), extent: "partial" }]);
    expect(out.get("Digicast")).toEqual({ area: "Digicast", level: "partial", reports: 3, updatedAt: at(9).toISOString() });
  });

  it("lets a full closure win over a partial one on the same road, in either order", () => {
    const full = { area: "Lacson St", publishedAt: at(7), extent: null } as const;
    const partial = { area: "Lacson St", publishedAt: at(9), extent: "partial" } as const;
    for (const closures of [[full, partial], [partial, full]]) {
      const out = overlayClosures(new Map(), closures);
      expect(out.get("Lacson St")).toMatchObject({ level: "closed", reports: 2, updatedAt: at(7).toISOString() });
    }
  });

  it("leaves roads without a closure alone, and adds roads that had no reading", () => {
    const out = overlayClosures(new Map([reading("Araneta St", "moderate")]), [{ area: "Gonzaga St", publishedAt: at(9), extent: null }]);
    expect(out.get("Araneta St")?.level).toBe("moderate");
    expect(out.get("Gonzaga St")).toMatchObject({ level: "closed", reports: 1 });
  });

  describe("daily hours", () => {
    // 3 PM to 3 AM Manila, 1-25 Oct: 07:00Z to 19:00Z the same day.
    const nightly = { area: "Lacson St", publishedAt: at(1), extent: null, dailyFrom: 15 * 60, dailyTo: 3 * 60, startsAt: new Date("2026-10-01T07:00:00Z"), endsAt: new Date("2026-10-25T19:00:00Z") };
    const run = (iso: string, base = new Map([reading("Lacson St", "moderate")])) => overlayClosures(base, [nightly], new Date(iso)).get("Lacson St");
    it("reads closed inside the window, edges included at the start only", () => {
      expect(run("2026-10-10T07:00:00Z")?.level).toBe("closed");
      expect(run("2026-10-10T06:59:00Z")?.level).toBe("moderate");
      expect(run("2026-10-10T18:59:00Z")?.level).toBe("closed");
      expect(run("2026-10-10T19:00:00Z")?.level).toBe("moderate");
    });
    it("covers the part of the window after midnight", () => {
      expect(run("2026-10-10T16:30:00Z")?.level).toBe("closed"); // 12:30 AM
      expect(run("2026-10-10T20:00:00Z")?.level).toBe("moderate"); // 4 AM
    });
    it("leaves a road with no reading absent outside the window", () => {
      expect(run("2026-10-10T02:00:00Z", new Map())).toBeUndefined();
    });
  });
});
