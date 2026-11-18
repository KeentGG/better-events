import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { ControlGraph, GraphEdge, GraphEdgeKind, GraphNode, IntakeFilter } from "../../src/lib/types";
import type { Db } from "../db/client";
import { areas, eventUpdates, events, itemActions, items, places } from "../db/schema";
import type { Viewer } from "../shared";
import { findGroup, groupOfCategory } from "./config";
import { loadStreamRows, type StreamRow } from "./stream";

/** How many table rows the graph draws; more would be unreadable. */
const GRAPH_ROWS = 100;
/** Places are only context, so the graph shows a few. */
const GRAPH_PLACES = 30;

type Person = { kind: "collector" | "staff" | "admin"; id: string; name: string };

/** Everything the graph links, loaded from the database. `toGraph` turns it into nodes and edges. */
export interface GraphInput {
  rows: StreamRow[];
  /** Items linked to a schedule event by a delay, cancellation or result (`event_updates`). */
  eventLinks: Array<{ itemId: string; event: { id: string; title: string; areaId: string | null } }>;
  places: Array<{ id: string; name: string; areaId: string | null; by: Person | null }>;
  areas: Array<{ id: string; name: string }>;
  /** Who verified or hid an item (`item_actions`). Moderators only. */
  actions: Array<{ itemId: string; action: "verify" | "hide"; by: Person }>;
  /** The official item a flagged conflict contradicts (`items.conflict_item_id`). Moderators only. */
  conflicts: Array<{ itemId: string; target: { id: string; title: string; category: string; status: GraphNode["status"] } }>;
}

const personId = (p: Person) => `person:${p.kind}:${p.id}`;

/**
 * GET /api/control/graph?filter=&group=: the rows of the intake table (the same filter and group)
 * with what they link to. Null for an unknown group.
 */
export async function buildGraph(db: Db, opts: { filter: IntakeFilter; group?: string; viewer: Viewer }, now = new Date()): Promise<ControlGraph | null> {
  const group = opts.group === undefined ? undefined : findGroup(opts.group);
  if (opts.group !== undefined && !group) return null;

  const all = await loadStreamRows(db, { filter: opts.filter, group, limit: GRAPH_ROWS + 1, viewer: opts.viewer });
  const rows = all.slice(0, GRAPH_ROWS);
  const itemIds = rows.flatMap((r) => (r.post.item ? [r.post.item.id] : []));
  const personIds = (kind: "collector" | "staff") => [...new Set(rows.flatMap((r) => (r.person?.kind === kind ? [r.person.id] : [])))];
  const collectorIds = personIds("collector");
  const staffIds = personIds("staff");
  const rowAreaIds = [...new Set(rows.flatMap((r) => (r.areaId ? [r.areaId] : [])))];

  const target = alias(items, "target");
  const [eventRows, placeRows, actionRows, conflictRows] = await Promise.all([
    itemIds.length
      ? db
          .select({ itemId: eventUpdates.itemId, id: events.id, title: events.title, areaId: events.areaId })
          .from(eventUpdates)
          .innerJoin(events, eq(eventUpdates.eventId, events.id))
          .where(inArray(eventUpdates.itemId, itemIds))
      : [],
    collectorIds.length || staffIds.length || rowAreaIds.length
      ? db
          .select()
          .from(places)
          .where(
            and(
              isNull(places.archivedAt),
              or(
                collectorIds.length ? inArray(places.createdByCollectorId, collectorIds) : undefined,
                staffIds.length ? inArray(places.createdByStaffId, staffIds) : undefined,
                rowAreaIds.length ? inArray(places.areaId, rowAreaIds) : undefined,
              ),
            ),
          )
          .orderBy(desc(places.updatedAt))
          .limit(GRAPH_PLACES)
      : [],
    opts.viewer.moderator && itemIds.length
      ? db
          .select()
          .from(itemActions)
          .where(and(inArray(itemActions.itemId, itemIds), inArray(itemActions.action, ["verify", "hide"])))
      : [],
    opts.viewer.moderator && itemIds.length
      ? db
          .select({ itemId: items.id, id: target.id, title: target.title, category: target.category, status: target.status })
          .from(items)
          .innerJoin(target, eq(items.conflictItemId, target.id))
          .where(and(inArray(items.id, itemIds), isNotNull(items.conflictItemId)))
      : [],
  ]);

  // Place authors are named by the rows' people; anyone else who added a place is left unnamed.
  const people = new Map<string, Person>(rows.flatMap((r) => (r.person ? [[`${r.person.kind}:${r.person.id}`, r.person]] : [])));
  const placeAuthor = (p: typeof places.$inferSelect): Person | null => {
    const key = p.createdByCollectorId ? `collector:${p.createdByCollectorId}` : p.createdByStaffId ? `staff:${p.createdByStaffId}` : undefined;
    return (key && people.get(key)) || null;
  };

  const eventLinks = eventRows.flatMap((e) => (e.itemId ? [{ itemId: e.itemId, event: { id: e.id, title: e.title, areaId: e.areaId } }] : []));
  const placeList = placeRows.map((p) => ({ id: p.id, name: p.name, areaId: p.areaId, by: placeAuthor(p) }));
  const areaIds = [...new Set([...rowAreaIds, ...eventLinks.flatMap((l) => (l.event.areaId ? [l.event.areaId] : [])), ...placeList.flatMap((p) => (p.areaId ? [p.areaId] : []))])];
  const areaRows = areaIds.length ? await db.select({ id: areas.id, name: areas.name }).from(areas).where(inArray(areas.id, areaIds)) : [];

  return {
    generatedAt: now.toISOString(),
    ...toGraph(
      {
        rows,
        eventLinks,
        places: placeList,
        areas: areaRows,
        actions: actionRows.map((a) => ({
          itemId: a.itemId,
          action: a.action as "verify" | "hide",
          by: a.staffId
            ? { kind: "staff", id: a.staffId, name: a.byName }
            : a.collectorId
              ? { kind: "collector", id: a.collectorId, name: a.byName }
              : { kind: "admin", id: "admin", name: a.byName },
        })),
        conflicts: conflictRows.map((c) => ({ itemId: c.itemId, target: { id: c.id, title: c.title, category: c.category, status: c.status } })),
      },
      opts.viewer,
    ),
    truncated: all.length > GRAPH_ROWS,
  };
}

/**
 * Nodes and edges from what `buildGraph` loaded. Each entity is one node however many rows reach it,
 * and each edge appears once. Team members get no `verified`, `hid` or `contradicts` edges, and no
 * nodes that only those edges would bring in.
 */
export function toGraph(input: GraphInput, viewer: Pick<Viewer, "moderator">): Pick<ControlGraph, "nodes" | "edges"> {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const node = (n: GraphNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
    return n.id;
  };
  const edge = (from: string, to: string, kind: GraphEdgeKind) => edges.set(`${kind}|${from}|${to}`, { from, to, kind });
  // "(team)" as in item history, since a team member and a staff member can share a name.
  const person = (p: Person) => node({ id: personId(p), kind: "person", label: p.kind === "collector" ? `${p.name} (team)` : p.name });
  const item = (i: { id: string; title: string; category: string; status?: GraphNode["status"] }) =>
    node({ id: `item:${i.id}`, kind: "item", label: i.title, category: i.category, group: groupOfCategory(i.category), status: i.status });
  const areaNames = new Map(input.areas.map((a) => [a.id, a.name]));
  const area = (id: string | null) => {
    const name = id && areaNames.get(id);
    return name ? node({ id: `area:${id}`, kind: "area", label: name }) : undefined;
  };

  for (const { post, person: who, source, areaId } of input.rows) {
    const itemId = post.item && item(post.item);
    if (post.origin === "post") {
      const postId = node({ id: `post:${post.id}`, kind: "post", label: post.text.split("\n")[0] });
      if (who) edge(person(who), postId, "sent");
      if (source) edge(node({ id: `source:${source.id}`, kind: "source", label: source.name }), postId, "sent");
      if (itemId) edge(postId, itemId, "became");
    } else if (who && itemId) {
      edge(person(who), itemId, "entered");
    }
    const areaNode = area(areaId);
    if (itemId && areaNode) edge(itemId, areaNode, "in_area");
  }

  for (const { itemId, event } of input.eventLinks) {
    const eventId = node({ id: `event:${event.id}`, kind: "event", label: event.title });
    edge(`item:${itemId}`, eventId, "about_event");
    const areaNode = area(event.areaId);
    if (areaNode) edge(eventId, areaNode, "in_area");
  }

  for (const p of input.places) {
    const placeId = node({ id: `place:${p.id}`, kind: "place", label: p.name });
    const areaNode = area(p.areaId);
    if (areaNode) edge(placeId, areaNode, "in_area");
    if (p.by) edge(person(p.by), placeId, "entered");
  }

  if (viewer.moderator) {
    for (const a of input.actions) edge(person(a.by), `item:${a.itemId}`, a.action === "verify" ? "verified" : "hid");
    for (const c of input.conflicts) edge(`item:${c.itemId}`, item(c.target), "contradicts");
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
