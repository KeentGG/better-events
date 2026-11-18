import { useCallback, useMemo, useState } from "react";
import { sampleControlGraph } from "../../data/control";
import { loadControl } from "../../lib/control";
import { GRAPH_SPACING, layoutGraph, type PlacedNode } from "../../lib/graphLayout";
import { GRAPH_NODE_KINDS, type ControlGraph, type GraphEdgeKind, type GraphNodeKind, type IntakeFilter } from "../../lib/types";
import { usePolling } from "../../lib/usePolling";
import { Skeleton, cn } from "../../ui";

const kindStyle: Record<GraphNodeKind, { label: string; fill: string }> = {
  person: { label: "People", fill: "var(--color-primary)" },
  source: { label: "Pages", fill: "var(--color-info)" },
  post: { label: "Posts", fill: "var(--color-ink-subtle)" },
  item: { label: "Feed items", fill: "var(--color-ok)" },
  event: { label: "Events", fill: "var(--color-accent)" },
  place: { label: "Places", fill: "var(--color-warn)" },
  area: { label: "Areas", fill: "var(--color-ink-muted)" },
};

const edgeStyle: Partial<Record<GraphEdgeKind, { stroke: string; dash?: string }>> = {
  verified: { stroke: "var(--color-ok)" },
  hid: { stroke: "var(--color-ink-subtle)", dash: "3 3" },
  contradicts: { stroke: "var(--color-danger)", dash: "5 3" },
};

/** Longest label drawn next to a node; the full text is in its tooltip. */
const LABEL_CHARS = 24;

/**
 * The intake as a graph (docs/MISSION_CONTROL.md §2.3): who sent what, what it became, and which events,
 * places and areas it touches, for the same filter as the table. Hovering or clicking a node highlights
 * its neighbours; clicking an item opens its group's slide-over (`onOpenGroup`, staff only). The table
 * stays the accessible view, so this is one image with a summary. Loaded lazily, and not drawn on phones.
 */
export default function IntakeGraph({
  token,
  filter,
  group,
  version,
  onOpenGroup,
  onSignOut,
}: {
  token: string | undefined;
  filter: IntakeFilter;
  group: string;
  version: number;
  onOpenGroup: ((group: string) => void) | undefined;
  onSignOut: () => void;
}) {
  const load = useCallback(() => {
    const query = new URLSearchParams({ filter, ...(group && { group }) });
    return loadControl(`/api/control/graph?${query}`, token, sampleControlGraph, onSignOut);
  }, [token, filter, group, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const graph = usePolling(load, 30_000);

  return (
    <div>
      <p className="px-4 py-6 text-sm text-ink-muted italic sm:hidden">The graph needs more room. Open mission control on a larger screen, or use the table.</p>
      <div className="hidden sm:block">
        {graph?.denied ? (
          <p className="px-4 py-6 text-sm text-ink-subtle italic">This filter is for staff.</p>
        ) : !graph?.data ? (
          <div className="p-4">
            <Skeleton className="h-64" />
          </div>
        ) : graph.data.nodes.length ? (
          <Drawing graph={graph.data} onOpenGroup={onOpenGroup} />
        ) : (
          <p className="px-4 py-6 text-sm text-ink-subtle italic">Nothing to draw for this filter.</p>
        )}
      </div>
    </div>
  );
}

function Drawing({ graph, onOpenGroup }: { graph: ControlGraph; onOpenGroup: ((group: string) => void) | undefined }) {
  const layout = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph]);
  const [hovered, setHovered] = useState<string>();
  const [pinned, setPinned] = useState<string>();
  const active = pinned ?? hovered;

  const lit = useMemo(() => {
    if (!active) return undefined;
    const ids = new Set([active]);
    for (const e of graph.edges) {
      if (e.from === active) ids.add(e.to);
      if (e.to === active) ids.add(e.from);
    }
    return ids;
  }, [active, graph.edges]);

  const counts = GRAPH_NODE_KINDS.map((kind) => [kind, graph.nodes.filter((n) => n.kind === kind).length] as const).filter(([, n]) => n > 0);
  const summary = `Graph of ${counts.map(([kind, n]) => `${n} ${kindStyle[kind].label.toLowerCase()}`).join(", ")}, with ${graph.edges.length} links. The table lists the same rows.`;

  function click(node: PlacedNode) {
    if (node.kind === "item" && node.group && onOpenGroup) return onOpenGroup(node.group);
    setPinned((id) => (id === node.id ? undefined : node.id));
  }

  return (
    <div className="space-y-2 pb-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs text-ink-muted">
        {counts.map(([kind, n]) => (
          <li key={kind} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: kindStyle[kind].fill }} />
            {kindStyle[kind].label} · {n}
          </li>
        ))}
        {graph.truncated && <li className="italic">Showing the newest 100 rows</li>}
      </ul>
      <div className="max-h-[70dvh] overflow-auto">
        <svg role="img" aria-label={summary} width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} className="block">
          <g fill="none" strokeWidth={1.25}>
            {layout.edges.map((e) => {
              const style = edgeStyle[e.kind];
              const on = !active || e.from === active || e.to === active;
              return (
                <path
                  key={`${e.kind}|${e.from}|${e.to}`}
                  d={e.path}
                  stroke={style?.stroke ?? "var(--color-line-strong)"}
                  strokeDasharray={style?.dash}
                  opacity={on ? 1 : 0.15}
                  className="transition-opacity"
                />
              );
            })}
          </g>
          {layout.nodes.map((node) => {
            const on = !lit || lit.has(node.id);
            const label = node.label.length > LABEL_CHARS ? `${node.label.slice(0, LABEL_CHARS - 1)}…` : node.label;
            const opens = node.kind === "item" && node.group && onOpenGroup;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                opacity={on ? 1 : 0.2}
                className={cn("transition-opacity", opens ? "cursor-pointer" : "cursor-default")}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(undefined)}
                onClick={() => click(node)}
              >
                <title>{node.label}</title>
                <circle r={node.id === active ? 7 : 5.5} fill={kindStyle[node.kind].fill} opacity={node.status === "hidden" ? 0.35 : 1} />
                <text x={10} dy="0.35em" fontSize={11} fill="var(--color-ink)" className={cn(node.status === "hidden" && "line-through")}>
                  {label}
                </text>
                {/* A wider hit area than the dot, so rows of nodes are easy to point at. */}
                <rect x={-8} y={-GRAPH_SPACING.row / 2} width={GRAPH_SPACING.column - 24} height={GRAPH_SPACING.row} fill="transparent" />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
