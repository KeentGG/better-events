import { describe, expect, it } from "vitest";
import { FIX_IDS, fixes, tiles } from "./inputAudit";

// The audit is edited by hand as fixes land, so its links must keep pointing somewhere.
describe("input audit", () => {
  const scenarios = tiles.flatMap((t) => t.scenarios);

  it("gives every scenario that doesn't fully pass a recommended fix, and none to those that do", () => {
    expect(scenarios.filter((s) => s.result !== "ok" && !s.fix?.fixes.length).map((s) => s.id)).toEqual([]);
    expect(scenarios.filter((s) => s.result === "ok" && s.fix && !s.before).map((s) => s.id)).toEqual([]);
  });

  it("leaves no scenario failing once all its fixes are done", () => {
    const done = new Set(fixes.filter((f) => f.status?.state === "done").map((f) => f.id));
    const stale = scenarios.filter((s) => s.result !== "ok" && s.fix?.fixes.every((id) => done.has(id)));
    expect(stale.map((s) => s.id)).toEqual([]);
  });

  it("has one card per fix, in priority order", () => {
    expect(fixes.map((f) => f.id)).toEqual([...FIX_IDS]);
  });

  it("keeps anchors unique, since #/audit/<id> scrolls to one", () => {
    const ids = [...tiles.map((t) => t.id), ...scenarios.map((s) => s.id), ...fixes.map((f) => `fix-${f.id}`)];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
