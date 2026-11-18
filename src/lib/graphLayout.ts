import type { GraphEdge, GraphNode, GraphNodeKind } from "./types";

/**
 * Layered layout for the intake graph: who sent or entered it, then posts, then items, then what the
 * items are about (events and places) and where (areas). Areas get their own column after events and
 * places, since both link to them.
 */
export const GRAPH_COLUMNS: Record<GraphNodeKind, number> = { person: 0, source: 0, post: 1, item: 2, event: 3, place: 3, area: 4 };

export const GRAPH_SPACING = { column: 180, row: 34, pad: 24, arc: 44, lastColumn: 130 } as const;

export interface PlacedNode extends GraphNode {
  x: number;
  y: number;
  column: number;
}

export interface PlacedEdge extends GraphEdge {
  /** SVG path from `from` to `to`. */
  path: string;
}

export interface GraphLayout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

const byLabel = (a: GraphNode, b: GraphNode) => a.label.localeCompare(b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Places nodes in columns by kind and orders each column with one barycenter pass, left to right: a
 * node sits near the average position of its neighbours in earlier columns, which untangles most
 * crossings. Ties and nodes with no earlier neighbour go by label, then id, so the same graph always
 * lays out the same way, whatever order the nodes came in, and nodes stay put across polls.
 * `contradicts` links two items in the same column, so it is drawn as an arc to the right of it.
 */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): GraphLayout {
  const { column: columnWidth, row, pad, arc, lastColumn } = GRAPH_SPACING;
  const columnCount = Math.max(...Object.values(GRAPH_COLUMNS)) + 1;
  const columns: GraphNode[][] = Array.from({ length: columnCount }, () => []);
  for (const n of nodes) columns[GRAPH_COLUMNS[n.kind]].push(n);

  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    neighbours.set(e.from, [...(neighbours.get(e.from) ?? []), e.to]);
    neighbours.set(e.to, [...(neighbours.get(e.to) ?? []), e.from]);
  }

  const index = new Map<string, number>();
  columns.forEach((list, c) => {
    const labelled = [...list].sort(byLabel);
    // Only earlier columns are in `index` yet.
    const centre = (n: GraphNode) => {
      const earlier = (neighbours.get(n.id) ?? []).filter((id) => index.has(id)).map((id) => index.get(id)!);
      return earlier.length ? earlier.reduce((sum, i) => sum + i, 0) / earlier.length : undefined;
    };
    const centres = new Map(labelled.map((n, i) => [n.id, centre(n) ?? i]));
    const ordered = c === 0 ? labelled : labelled.sort((a, b) => centres.get(a.id)! - centres.get(b.id)! || byLabel(a, b));
    columns[c] = ordered;
    ordered.forEach((n, i) => index.set(n.id, i));
  });

  const tallest = Math.max(1, ...columns.map((list) => list.length));
  const placed = new Map<string, PlacedNode>();
  columns.forEach((list, c) => {
    // Shorter columns are centred against the tallest.
    const offset = ((tallest - list.length) * row) / 2;
    list.forEach((n, i) => placed.set(n.id, { ...n, column: c, x: pad + c * columnWidth, y: pad + offset + i * row + row / 2 }));
  });

  const placedEdges = edges.flatMap((e): PlacedEdge[] => {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) return [];
    if (a.column === b.column) {
      const bulge = arc + Math.abs(b.y - a.y) / 4;
      return [{ ...e, path: `M ${a.x} ${a.y} C ${a.x + bulge} ${a.y}, ${b.x + bulge} ${b.y}, ${b.x} ${b.y}` }];
    }
    const mid = (a.x + b.x) / 2;
    return [{ ...e, path: `M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}` }];
  });

  return {
    // The last column only needs room for its labels.
    width: pad * 2 + (columnCount - 1) * columnWidth + lastColumn,
    height: pad * 2 + tallest * row,
    nodes: [...placed.values()],
    edges: placedEdges,
  };
}
