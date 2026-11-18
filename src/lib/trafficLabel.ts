import type { Geometry, Position } from "geojson";
import { BACOLOD_BOUNDS } from "./map";
import type { FeedItem, TrafficArea, TrafficLevel } from "./types";
import { clockOfMinutes, nextWindowStart, onNow } from "./dailyWindow";
import { clock, dayKey, dayOnly, dayStamp, dayTime } from "./time";

const levelWord: Record<TrafficLevel, string> = {
  clear: "Clear",
  moderate: "Moderate",
  heavy: "Heavy",
  partial: "Partly closed",
  closed: "Closed",
};

const weight: Record<TrafficLevel, number> = { clear: 1, moderate: 2, heavy: 3, partial: 4, closed: 5 };

function brief(iso: string) {
  return clock(iso).replace(/:00/g, "");
}

export interface TrafficStatus {
  /** "Closed" ("Partly closed"), or "Closes Sun 18 Oct" while the closure is still ahead. */
  headline: string;
  /** "until 6 AM" once it is on, "10 AM – 9 PM" before it starts. */
  hours: string | null;
  /** Announced but not started, so the road is still open. */
  pending: boolean;
  /** When a pending one begins, for putting what is ahead in order. */
  startsAt: string | null;
  kind: "closure" | "advisory" | "level";
}

/** The day is said once, in the headline. An end past the next morning keeps its own day. */
function hoursAhead(startsAt: string, endsAt: string | null) {
  if (!endsAt) return `from ${brief(startsAt)}`;
  const endDay = dayKey(endsAt);
  const overnight = endDay === dayKey(startsAt) || endDay === dayKey(new Date(Date.parse(startsAt) + 86_400_000).toISOString());
  return `${brief(startsAt)} – ${overnight ? brief(endsAt) : `${dayStamp(endsAt)}, ${brief(endsAt)}`}`;
}

function status(word: string, ahead: string, post: FeedItem | undefined, now: Date, kind: TrafficStatus["kind"]): TrafficStatus {
  if (post?.startsAt && Date.parse(post.startsAt) > now.getTime()) {
    return { headline: `${ahead} ${dayOnly(post.startsAt, now)}`, hours: hoursAhead(post.startsAt, post.endsAt), pending: true, startsAt: post.startsAt, kind };
  }
  const hours = post?.endsAt ? `until ${dayTime(post.endsAt, now).replace(/:00/g, "")}` : post?.startsAt ? `since ${dayTime(post.startsAt, now).replace(/:00/g, "")}` : null;
  return { headline: word, hours, pending: false, startsAt: null, kind };
}

function newest(rows: FeedItem[]) {
  return [...rows].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
}

/**
 * Areas to draw. A closure or advisory still in the feed is drawn even before it starts, which is
 * when the traffic list is empty. Advisories use the moderate amber so red stays a closure. A partial
 * closure is drawn partly closed, unless the road also has a full one.
 */
export function mapAreas(areas: TrafficArea[], feed: FeedItem[] | undefined): TrafficArea[] {
  const byName = new Map(areas.map((a) => [a.area, a]));
  for (const item of feed ?? []) {
    if (!item.area || (item.category !== "road_closure" && item.category !== "traffic_advisory")) continue;
    const prev = byName.get(item.area);
    if (item.category === "road_closure") {
      const level = item.closureExtent === "partial" ? "partial" : "closed";
      if (!prev || weight[prev.level] < weight[level]) byName.set(item.area, { area: item.area, level, reports: prev?.reports ?? 1, updatedAt: item.publishedAt });
      continue;
    }
    if (!prev) byName.set(item.area, { area: item.area, level: "moderate", reports: 1, updatedAt: item.publishedAt });
  }
  return [...byName.values()];
}

/** A closure with daily hours: closed inside them, and "Closes 3:00 PM" (the next window) outside. */
function dailyStatus(word: string, ahead: string, post: FeedItem, now: Date): TrafficStatus {
  const item = { startsAt: post.startsAt, endsAt: post.endsAt, dailyFrom: post.dailyFrom, dailyTo: post.dailyTo };
  const brief = (m: number) => clockOfMinutes(m).replace(/:00/g, "");
  const hours = `daily ${brief(post.dailyFrom!)} – ${brief(post.dailyTo!)}`;
  if (onNow(item, now.getTime())) return { headline: word, hours: `${hours}${post.endsAt ? `, until ${dayStamp(post.endsAt)}` : ""}`, pending: false, startsAt: null, kind: "closure" };
  const next = nextWindowStart(item, Math.max(now.getTime(), post.startsAt ? Date.parse(post.startsAt) : 0));
  if (!next) return { headline: word, hours, pending: false, startsAt: null, kind: "closure" };
  const day = dayOnly(next, now);
  return { headline: `${ahead} ${day === "today" ? "" : `${day} `}${clockOfMinutes(post.dailyFrom!)}`, hours, pending: true, startsAt: next, kind: "closure" };
}

/** What a road's card says: its state now, or the closure coming, with the hours on their own line. */
export function trafficStatus(area: TrafficArea, feed: FeedItem[] | undefined, now = new Date()): TrafficStatus {
  const closures = (feed ?? []).filter((i) => i.area === area.area && i.category === "road_closure");
  // A full closure on the road wins over a partial one, as on the map.
  const closure = newest(closures.filter((i) => !i.closureExtent)) ?? newest(closures);
  const partly = area.level === "partial" || (area.level !== "closed" && !!closure && closure.closureExtent === "partial");
  const advisory = newest((feed ?? []).filter((i) => i.area === area.area && i.category === "traffic_advisory"));
  if (closure && closure.dailyFrom != null && closure.dailyTo != null) return dailyStatus(partly ? "Partly closed" : "Closed", partly ? "Partly closes" : "Closes", closure, now);
  if (area.level === "closed" || area.level === "partial" || closure) return status(partly ? "Partly closed" : "Closed", partly ? "Partly closes" : "Closes", closure, now, "closure");
  if (advisory && area.level !== "heavy" && area.level !== "clear") return status("Advisory", "Advisory", advisory, now, "advisory");
  // A reported level is about now, so an advisory still ahead goes on the second line and the level stays as it is.
  const s = status(levelWord[area.level], "Advisory", advisory, now, "level");
  return s.pending ? { ...s, headline: levelWord[area.level], hours: `${s.headline}, ${s.hours}`, pending: false, startsAt: null } : s;
}

/** The same on one line for a map label: "Closed · until 6 AM", "Closes tomorrow · 9 PM – 6 AM". */
export function trafficDetail(area: TrafficArea, feed: FeedItem[] | undefined, now = new Date()): string {
  const s = trafficStatus(area, feed, now);
  return s.hours ? `${s.headline} · ${s.hours}` : s.headline;
}

export interface TrafficDay {
  /** "today", "tomorrow" or "Sun 18 Oct". */
  day: string;
  rows: { area: TrafficArea; status: TrafficStatus }[];
}

/**
 * The list beside the map, split the way a driver asks it: what is on the road now, worst first,
 * then what has been announced, in the order it will happen and gathered by day.
 */
export function trafficAgenda(areas: TrafficArea[], feed: FeedItem[] | undefined, now = new Date()): { live: { area: TrafficArea; status: TrafficStatus }[]; ahead: TrafficDay[] } {
  const rows = mapAreas(areas, feed).map((area) => ({ area, status: trafficStatus(area, feed, now) }));
  const live = rows.filter((r) => !r.status.pending).sort((a, b) => weight[b.area.level] - weight[a.area.level] || b.area.reports - a.area.reports);
  const ahead: TrafficDay[] = [];
  for (const row of rows.filter((r) => r.status.pending).sort((a, b) => Date.parse(a.status.startsAt!) - Date.parse(b.status.startsAt!) || a.area.area.localeCompare(b.area.area))) {
    const day = dayOnly(row.status.startsAt!, now);
    const last = ahead[ahead.length - 1];
    if (last?.day === day) last.rows.push(row);
    else ahead.push({ day, rows: [row] });
  }
  return { live, ahead };
}

type Line = [number, number][];

function key(c: Position) {
  return `${Number(c[0]).toFixed(5)},${Number(c[1]).toFixed(5)}`;
}

function metres(a: Position, b: Position) {
  const dx = (Number(a[0]) - Number(b[0])) * 111_320 * Math.cos((((Number(a[1]) + Number(b[1])) / 2) * Math.PI) / 180);
  const dy = (Number(a[1]) - Number(b[1])) * 110_540;
  return Math.hypot(dx, dy);
}

function lengthOf(line: Line) {
  let n = 0;
  for (let i = 1; i < line.length; i++) n += metres(line[i - 1], line[i]);
  return n;
}

/** Join road pieces that share an endpoint. Each street arrives as dozens of short OSM ways. */
function mergeLines(parts: Line[]): Line[] {
  const usable = parts.filter((p) => p.length >= 2);
  const unused = new Set(usable.map((_, i) => i));
  const at = new Map<string, number[]>();
  usable.forEach((p, i) => {
    for (const end of [0, p.length - 1]) {
      const k = key(p[end]);
      at.set(k, [...(at.get(k) ?? []), i]);
    }
  });
  const chains: Line[] = [];
  while (unused.size) {
    const start = unused.values().next().value as number;
    unused.delete(start);
    let chain = usable[start].slice() as Line;
    let grew = true;
    while (grew) {
      grew = false;
      for (const dir of ["fwd", "back"] as const) {
        const endPt = dir === "fwd" ? chain[chain.length - 1] : chain[0];
        const k = key(endPt);
        const cand = (at.get(k) ?? [])
          .filter((i) => unused.has(i))
          .sort((a, b) => lengthOf(usable[b]) - lengthOf(usable[a]))[0];
        if (cand === undefined) continue;
        unused.delete(cand);
        const seq = usable[cand].slice() as Line;
        if (dir === "fwd") {
          if (key(seq[0]) !== k) seq.reverse();
          chain = chain.concat(seq.slice(1));
        } else {
          if (key(seq[seq.length - 1]) !== k) seq.reverse();
          chain = seq.slice(0, -1).concat(chain);
        }
        grew = true;
      }
    }
    chains.push(chain);
  }
  return chains;
}

function along(line: Line, atMetres: number): [number, number] {
  let left = atMetres;
  for (let i = 1; i < line.length; i++) {
    const d = metres(line[i - 1], line[i]);
    if (d >= left && d > 0) {
      const t = left / d;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    }
    left -= d;
  }
  const last = line[line.length - 1];
  return [last[0], last[1]];
}

/** Keep the part of a segment that falls inside Bacolod. A road saved past the city would otherwise be labelled out of view. */
function clipToCity(a: [number, number], b: [number, number]): [[number, number], [number, number]] | null {
  const [sw, ne] = BACOLOD_BOUNDS;
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - sw[0], ne[0] - a[0], a[1] - sw[1], ne[1] - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return null;
    }
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

function citySpan(line: Line): { length: number; at: (metres: number) => [number, number] } {
  const pieces: Line[] = [];
  for (let i = 1; i < line.length; i++) {
    const clipped = clipToCity(line[i - 1], line[i]);
    if (clipped) pieces.push(clipped);
  }
  const length = pieces.reduce((n, p) => n + lengthOf(p), 0);
  return {
    length,
    at: (metres: number) => {
      let left = metres;
      for (const piece of pieces) {
        const d = lengthOf(piece);
        if (d >= left) return along(piece, left);
        left -= d;
      }
      return along(pieces[pieces.length - 1], 0);
    },
  };
}

/**
 * Where a street's name sits. The saved roads are many short pieces, and a name will not fit on
 * those, so they are joined and the name is placed at the middle of the longest run.
 */
export function labelAnchor(geometry: Geometry): [number, number] | null {
  if (geometry.type === "Point") return [geometry.coordinates[0], geometry.coordinates[1]];
  const parts: Line[] = geometry.type === "LineString" ? [geometry.coordinates as Line] : geometry.type === "MultiLineString" ? (geometry.coordinates as Line[]) : [];
  const chains = mergeLines(parts);
  if (!chains.length) return null;
  const spans = chains.map((chain) => ({ chain, span: citySpan(chain) }));
  const best = spans.reduce((a, b) => (b.span.length > a.span.length ? b : a));
  if (best.span.length > 0) return best.span.at(best.span.length / 2);
  const fallback = chains.reduce((a, b) => (lengthOf(b) > lengthOf(a) ? b : a));
  return along(fallback, lengthOf(fallback) / 2);
}
