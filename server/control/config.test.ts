import { describe, expect, it } from "vitest";
import { CATEGORIES, UPDATES, type UpdateKey } from "../../src/lib/types";
import { GROUPS, groupOfCategory } from "./config";

// The wall only tells the truth if every piece of data lands on exactly one tile.
describe("mission control groups", () => {
  it("gives traffic an hour, so an hourly sweep can land inside the window", () => {
    expect(GROUPS.find((g) => g.key === "traffic")?.staleMinutes).toBe(60);
    // Crowd reports keeps its own 15-minute window; the two do not share a constant.
    expect(GROUPS.find((g) => g.key === "crowd_reports")?.staleMinutes).toBe(15);
  });

  it("let the team post a crowd level on the Crowd reports tile, which follows the newest reading", () => {
    const tile = GROUPS.find((g) => g.key === "crowd_reports");
    expect(tile?.updates).toEqual(["crowd_level"]);
    expect(tile?.feeds).toEqual(["crowd_readings"]);
    expect(UPDATES.crowd_level.lands).toBe("crowd_readings");
  });

  it("have unique keys", () => {
    const keys = GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(CATEGORIES)("put category %s in exactly one group", (category) => {
    expect(GROUPS.filter((g) => g.categories.some((c) => c === category))).toHaveLength(1);
    expect(groupOfCategory(category)).toBeDefined();
  });

  // Kinds live in the database, so the split is by feed: promo spots on one tile, every other place on another.
  it.each(["places", "place:promo"])("put the %s feed in exactly one group", (feed) => {
    expect(GROUPS.filter((g) => g.feeds.some((f) => f === feed))).toHaveLength(1);
  });

});

// Update mode offers each kind of update on the one tile it freshens.
describe("mission control updates", () => {
  const offered = (g: (typeof GROUPS)[number]) => new Set<UpdateKey>([...g.updates, ...(g.editor ? [g.editor] : [])]);

  it.each(GROUPS.map((g) => [g.key, g] as const))("offer at most 5 on the %s tile", (_, g) => {
    expect(g.updates.length).toBeLessThanOrEqual(5);
  });

  it.each(GROUPS.map((g) => [g.key, g] as const))("freshen the %s group itself", (_, g) => {
    const own = new Set<string>([...g.categories, ...g.feeds, ...g.fetchers]);
    expect([...offered(g)].filter((key) => !own.has(UPDATES[key].lands))).toEqual([]);
  });

  it.each(Object.keys(UPDATES) as UpdateKey[])("put %s in exactly one group", (key) => {
    expect(GROUPS.filter((g) => offered(g).has(key))).toHaveLength(1);
  });

  it("never share a key with a group, since #/control/<key> opens either", () => {
    expect(GROUPS.filter((g) => Object.hasOwn(UPDATES, g.key))).toEqual([]);
  });

  it("explain where the data comes from on a tile with nothing to update", () => {
    expect(GROUPS.filter((g) => !g.updates.length && !g.about).map((g) => g.key)).toEqual([]);
  });
});
