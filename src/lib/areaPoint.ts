import type { Feature, FeatureCollection, Geometry } from "geojson";

/** Where an area sits on the map: [lng, lat]. */
export type LngLat = [number, number];

/** Posted names that are the same place as a saved shape. */
export const SAME_PLACE: Record<string, string> = {
  BCGC: "Bacolod Government Center",
  "Bacolod Public Plaza": "Public Plaza",
  "Lacson Street": "Lacson St",
  "Circumferential Road": "Circumferential Rd",
  "Lopez Jaena Street": "Lopez Jaena St",
  "Burgos Ave": "Burgos St",
  Gatuslao: "Gatuslao St",
  Gonzaga: "Gonzaga St",
  Rizal: "Rizal St",
  "San Juan": "San Juan St",
};

const lines = (g: Geometry): LngLat[][] =>
  g.type === "LineString" ? [g.coordinates as LngLat[]] : g.type === "MultiLineString" ? (g.coordinates as LngLat[][]) : [];

const dist = (a: LngLat, b: LngLat) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** The point halfway along a line's length, which stays on a curved road where a bounding-box centre would miss it. */
export function midpointAlong(line: LngLat[]): LngLat | null {
  if (!line.length) return null;
  const total = line.slice(1).reduce((sum, p, i) => sum + dist(line[i], p), 0);
  if (total === 0) return line[0];
  let left = total / 2;
  for (let i = 1; i < line.length; i++) {
    const d = dist(line[i - 1], line[i]);
    if (left <= d) {
      const t = d === 0 ? 0 : left / d;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    }
    left -= d;
  }
  return line[line.length - 1];
}

const length = (line: LngLat[]) => line.slice(1).reduce((sum, p, i) => sum + dist(line[i], p), 0);

/**
 * A representative point for an area: the area's own coordinates when it has them, else the midpoint along the
 * longest saved line of that name (or its alias), else a saved point. Null when the area has neither.
 */
export function areaPoint(
  name: string,
  roads: FeatureCollection,
  own?: { lat?: number | null; lng?: number | null },
): LngLat | null {
  if (own && own.lat != null && own.lng != null) return [own.lng, own.lat];
  for (const n of [name, SAME_PLACE[name]].filter(Boolean)) {
    const hits = roads.features.filter((f: Feature) => f.properties?.area === n);
    if (!hits.length) continue;
    const all = hits.flatMap((f) => lines(f.geometry));
    if (all.length) {
      const longest = all.reduce((a, b) => (length(b) > length(a) ? b : a));
      const at = midpointAlong(longest);
      if (at) return at;
    }
    const pt = hits.find((f) => f.geometry.type === "Point");
    if (pt) return (pt.geometry as { coordinates: number[] }).coordinates.slice(0, 2) as LngLat;
  }
  return null;
}
