import { describe, expect, it } from "vitest";
import { GRAPH_COLUMNS, layoutGraph } from "./graphLayout";
import type { GraphEdge, GraphNode } from "./types";

const n = (id: string, kind: GraphNode["kind"], label = id): GraphNode => ({ id, kind, label });

// Two people, each with a post whose label sorts the other way round, so label order alone would cross.
const nodes = [n("p:ana", "person", "Ana"), n("p:ben", "person", "Ben"), n("post:1", "post", "zebra"), n("post:2", "post", "apple"), n("item:1", "item"), n("item:2", "item"), n("area:1", "area")];
const edges: GraphEdge[] = [
  { from: "p:ana", to: "post:1", kind: "sent" },
  { from: "p:ben", to: "post:2", kind: "sent" },
  { from: "post:1", to: "item:1", kind: "became" },
  { from: "post:2", to: "item:2", kind: "became" },
  { from: "item:1", to: "area:1", kind: "in_area" },
  { from: "item:2", to: "item:1", kind: "contradicts" },
];

const at = (layout: ReturnType<typeof layoutGraph>, id: string) => layout.nodes.find((node) => node.id === id)!;

describe("layoutGraph", () => {
  const layout = layoutGraph(nodes, edges);

  it("puts who, posts, items, events and places, then areas in columns left to right", () => {
    expect(at(layout, "p:ana").column).toBe(GRAPH_COLUMNS.person);
    expect(at(layout, "post:1").x).toBeGreaterThan(at(layout, "p:ana").x);
    expect(at(layout, "item:1").x).toBeGreaterThan(at(layout, "post:1").x);
    expect(at(layout, "area:1").x).toBeGreaterThan(at(layout, "item:1").x);
  });

  it("orders a column by its neighbours to the left, so edges don't cross", () => {
    // By label "apple" would come first; next to Ana, "zebra" goes on top.
    expect(at(layout, "post:1").y).toBeLessThan(at(layout, "post:2").y);
    expect(at(layout, "item:1").y).toBeLessThan(at(layout, "item:2").y);
  });

  it("lays out the same graph the same way whatever order it arrives in", () => {
    const shuffled = layoutGraph([...nodes].reverse(), [...edges].reverse());
    for (const node of nodes) expect(at(shuffled, node.id)).toEqual(at(layout, node.id));
  });

  it("draws contradicts as an arc to the right of the items column", () => {
    const arc = layout.edges.find((e) => e.kind === "contradicts")!;
    const x = at(layout, "item:1").x;
    const points = arc.path.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = points.filter((_, i) => i % 2 === 0);
    expect(xs[0]).toBe(x);
    expect(xs[xs.length - 1]).toBe(x);
    expect(Math.min(...xs.slice(1, -1))).toBeGreaterThan(x);
  });

  it("drops edges to nodes it doesn't have", () => {
    expect(layoutGraph(nodes, [...edges, { from: "p:ana", to: "item:missing", kind: "entered" }]).edges).toHaveLength(edges.length);
  });
});
