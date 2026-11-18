import { describe, expect, it } from "vitest";
import type { ControlPost } from "../../src/lib/types";
import { toGraph, type GraphInput } from "./graph";
import type { StreamRow } from "./stream";

const maria = { kind: "collector" as const, id: "c-maria", name: "Maria" };
const ken = { kind: "staff" as const, id: "s-ken", name: "Ken" };

const row = (over: Partial<ControlPost> & Pick<ControlPost, "id">, extra: Partial<StreamRow> = {}): StreamRow => ({
  post: {
    origin: "post",
    receivedAt: "2026-10-20T12:00:00Z",
    platform: "facebook",
    author: null,
    text: "lacson open na ya",
    url: null,
    via: { kind: "team", name: "Maria" },
    official: false,
    outcome: "used",
    reason: null,
    mine: false,
    item: null,
    ...over,
  },
  person: maria,
  source: null,
  areaId: "a-lacson",
  rawPostId: over.id,
  ...extra,
});

const reopening = { id: "i-open", category: "road_reopening", title: "Lacson open", area: "Lacson St", status: "published" as const, flag: "conflict" as const, verifiedAt: null };
const closure = { id: "i-closed", category: "road_closure", title: "Closed: Lacson St", area: "Lacson St", status: "published" as const, flag: null, verifiedAt: null };

const input: GraphInput = {
  rows: [
    row({ id: "p1", item: reopening }),
    // The same team member again, so they stay one node.
    row({ id: "p2", item: null }, { areaId: null }),
    row({ id: "i-closed", origin: "desk", platform: "desk", via: { kind: "staff", name: "Ken" }, item: closure }, { person: ken, rawPostId: null }),
  ],
  eventLinks: [{ itemId: "i-closed", event: { id: "e1", title: "Street dance", areaId: "a-lacson" } }],
  places: [{ id: "pl1", name: "Lagoon food park", areaId: "a-lagoon", by: maria }],
  areas: [
    { id: "a-lacson", name: "Lacson St" },
    { id: "a-lagoon", name: "Capitol Lagoon" },
  ],
  actions: [{ itemId: "i-open", action: "hide", by: ken }],
  conflicts: [{ itemId: "i-open", target: { id: "i-closed", title: "Closed: Lacson St", category: "road_closure", status: "published" } }],
};

const has = (edges: { from: string; to: string; kind: string }[], kind: string, from: string, to: string) => edges.some((e) => e.kind === kind && e.from === from && e.to === to);

describe("toGraph", () => {
  const { nodes, edges } = toGraph(input, { moderator: true });
  const ids = nodes.map((n) => n.id);

  it("makes one node per entity, however many rows reach it", () => {
    expect(ids.filter((id) => id === "person:collector:c-maria")).toHaveLength(1);
    expect(ids.filter((id) => id === "item:i-closed")).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("links who sent a post to it, and the post to what it became", () => {
    expect(has(edges, "sent", "person:collector:c-maria", "post:p1")).toBe(true);
    expect(has(edges, "became", "post:p1", "item:i-open")).toBe(true);
  });

  it("links desk entries straight from whoever entered them, with no post", () => {
    expect(has(edges, "entered", "person:staff:s-ken", "item:i-closed")).toBe(true);
    expect(ids).not.toContain("post:i-closed");
  });

  it("puts items, events and places in their areas, and items about their events", () => {
    expect(has(edges, "in_area", "item:i-open", "area:a-lacson")).toBe(true);
    expect(has(edges, "about_event", "item:i-closed", "event:e1")).toBe(true);
    expect(has(edges, "in_area", "event:e1", "area:a-lacson")).toBe(true);
    expect(has(edges, "in_area", "place:pl1", "area:a-lagoon")).toBe(true);
    expect(has(edges, "entered", "person:collector:c-maria", "place:pl1")).toBe(true);
  });

  it("gives items their group and category", () => {
    expect(nodes.find((n) => n.id === "item:i-open")).toMatchObject({ kind: "item", group: "traffic", category: "road_reopening" });
  });

  it("shows moderators staff actions and what a conflict contradicts", () => {
    expect(has(edges, "hid", "person:staff:s-ken", "item:i-open")).toBe(true);
    expect(has(edges, "contradicts", "item:i-open", "item:i-closed")).toBe(true);
  });

  it("leaves staff actions and conflicts out for team members", () => {
    const team = toGraph(input, { moderator: false });
    expect(team.edges.filter((e) => ["verified", "hid", "contradicts"].includes(e.kind))).toEqual([]);
  });

  it("only draws edges between nodes it has", () => {
    const known = new Set(ids);
    expect(edges.filter((e) => !known.has(e.from) || !known.has(e.to))).toEqual([]);
  });
});
