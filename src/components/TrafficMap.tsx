import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import roads from "../data/bacolod-roads.json";
import { SAME_PLACE as samePlace, areaPoint } from "../lib/areaPoint";
import { BACOLOD_BOUNDS, openMap } from "../lib/map";
import type { VenueMark } from "../lib/venueMarks";
import { labelAnchor, mapAreas, trafficStatus } from "../lib/trafficLabel";
import type { CrowdArea, FeedItem, TrafficArea } from "../lib/types";
import { Skeleton } from "../ui";

/*
 * Real map of Bacolod (the shared base map in src/lib/map.ts). The roads the feed reports on come
 * from OpenStreetMap too, saved in src/data/bacolod-roads.json, so each can be coloured by its traffic level.
 */

const level = { clear: "#2f9e5b", moderate: "#e39a2d", heavy: "#d6452f", partial: "#d6452f", closed: "#d6452f" };

/** Crowd readings with coordinates, as a point each. The traffic dots are filled; these are open rings, so a crowd is never read as a road. */
function crowdPoints(crowd: CrowdArea[] | undefined): FeatureCollection {
  const features: Feature[] = [];
  for (const c of crowd ?? []) {
    const at = areaPoint(c.area, saved, c);
    if (at) features.push({ type: "Feature", properties: { area: c.area, crowd: c.level }, geometry: { type: "Point", coordinates: at } });
  }
  return { type: "FeatureCollection", features };
}

/** Event venues as a point each, with the words for the tap. */
function venuePoints(venues: VenueMark[] | undefined): FeatureCollection {
  return { type: "FeatureCollection", features: (venues ?? []).map((v) => ({ type: "Feature", properties: { text: v.text }, geometry: { type: "Point", coordinates: v.at } })) };
}

const crowdColour = { quiet: level.clear, busy: level.moderate, packed: level.heavy };

const saved = roads as FeatureCollection;

function geometryFor(area: string): Geometry | null {
  const names = [area, samePlace[area]].filter(Boolean);
  for (const name of names) {
    const hit = saved.features.find((f) => f.properties?.area === name);
    if (hit) return hit.geometry;
  }
  return null;
}

/** One feature per reported area, plus a point to hang the name on. Streets are saved in short pieces, so the name sits at the middle of the joined line. */
function withLevels(areas: TrafficArea[], feed: FeedItem[] | undefined, selected: string | undefined): FeatureCollection {
  const features: Feature[] = [];
  for (const area of mapAreas(areas, feed)) {
    const geometry = geometryFor(area.area);
    if (!geometry) continue;
    const status = trafficStatus(area, feed);
    const isSelected = area.area === selected;
    // A name alone for what is still ahead, so the roads that matter now keep their hours. Picking a road brings its hours back.
    const text = status.pending && !isSelected ? area.area : [area.area, status.headline, status.hours].filter(Boolean).join("\n");
    const properties = { area: area.area, level: area.level, selected: isSelected, pending: status.pending, text, rank: isSelected ? 0 : status.pending ? 2 : 1 };
    features.push({ type: "Feature", properties, geometry });
    if (geometry.type === "Point") continue;
    const at = labelAnchor(geometry);
    if (at) features.push({ type: "Feature", properties: { ...properties, kind: "label" }, geometry: { type: "Point", coordinates: at } });
  }
  return { type: "FeatureCollection", features };
}

/** The box around these features, keeping to the city: a road saved past it would otherwise pull the view out to sea. */
function boundsOf(features: Feature[]): [[number, number], [number, number]] | null {
  const [sw, ne] = BACOLOD_BOUNDS;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const f of features) {
    if (f.properties?.kind === "label") continue;
    const g = f.geometry;
    const coords = g.type === "Point" ? [g.coordinates] : g.type === "LineString" ? g.coordinates : g.type === "MultiLineString" ? g.coordinates.flat() : [];
    for (const [x, y] of coords) {
      if (x < sw[0] || x > ne[0] || y < sw[1] || y > ne[1]) continue;
      west = Math.min(west, x);
      east = Math.max(east, x);
      south = Math.min(south, y);
      north = Math.max(north, y);
    }
  }
  return west === Infinity ? null : [[west, south], [east, north]];
}

export function TrafficMap({ areas, crowd, feed, venues, selected, onSelect }: { areas: TrafficArea[]; crowd?: CrowdArea[]; feed?: FeedItem[]; venues?: VenueMark[]; selected?: string; onSelect: (area: string | undefined) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const framed = useRef(false);
  const focused = useRef<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const latest = useRef({ areas, crowd, feed, venues, selected, onSelect });
  latest.current = { areas, crowd, feed, venues, selected, onSelect };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!box.current) return;
        const m = await openMap(box.current, {}, (m, maplibre, theme) => {
          const { areas, feed, selected } = latest.current;
          m.addSource("traffic", { type: "geojson", data: withLevels(areas, feed, selected) });
          const colour = ["match", ["get", "level"], "clear", level.clear, "moderate", level.moderate, "heavy", level.heavy, "partial", level.partial, "closed", level.closed, "#000"] as never;
          // Announced but not started: still drawn, but quieter than what is on the road now.
          const faded = ["case", ["all", ["get", "pending"], ["!", ["get", "selected"]]], 0.4, 1] as never;
          const roadsWithData = ["all", ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]], ["!=", ["get", "level"], "none"]] as never;
          m.addLayer({
            id: "traffic-casing",
            type: "line",
            source: "traffic",
            filter: roadsWithData,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": theme === "dark" ? "#0d0a08" : "#ffffff", "line-width": ["case", ["get", "selected"], 14, 9] },
          });
          m.addLayer({
            id: "traffic-line",
            type: "line",
            source: "traffic",
            filter: ["all", roadsWithData, ["!", ["in", ["get", "level"], ["literal", ["closed", "partial"]]]]] as never,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": colour, "line-width": ["case", ["get", "selected"], 8, 5], "line-opacity": faded },
          });
          m.addLayer({
            id: "traffic-closed",
            type: "line",
            source: "traffic",
            filter: ["all", roadsWithData, ["==", ["get", "level"], "closed"]] as never,
            layout: { "line-join": "round" },
            paint: { "line-color": level.closed, "line-width": ["case", ["get", "selected"], 8, 5], "line-dasharray": [0.6, 1.2], "line-opacity": faded },
          });
          // Part of the road is shut: the closed red with long dashes, so it reads as a closure but not a whole one.
          m.addLayer({
            id: "traffic-partial",
            type: "line",
            source: "traffic",
            filter: ["all", roadsWithData, ["==", ["get", "level"], "partial"]] as never,
            layout: { "line-join": "round" },
            paint: { "line-color": level.partial, "line-width": ["case", ["get", "selected"], 8, 5], "line-dasharray": [2.4, 1.2], "line-opacity": faded },
          });
          m.addLayer({
            id: "traffic-place",
            type: "circle",
            source: "traffic",
            filter: ["all", ["==", ["geometry-type"], "Point"], ["!=", ["get", "kind"], "label"], ["!=", ["get", "level"], "none"]] as never,
            paint: {
              "circle-color": colour,
              "circle-radius": ["case", ["get", "selected"], 11, 8],
              "circle-stroke-color": theme === "dark" ? "#0d0a08" : "#ffffff",
              "circle-stroke-width": 3,
              "circle-opacity": faded,
            },
          });

          // Crowds: an open ring at the area's own point, drawn under the road labels.
          m.addSource("crowd", { type: "geojson", data: crowdPoints(latest.current.crowd) });
          m.addLayer({
            id: "crowd-ring",
            type: "circle",
            source: "crowd",
            paint: {
              "circle-color": ["match", ["get", "crowd"], "quiet", crowdColour.quiet, "busy", crowdColour.busy, "packed", crowdColour.packed, "#000"] as never,
              "circle-opacity": 0.18,
              "circle-radius": ["match", ["get", "crowd"], "packed", 22, "busy", 18, 14] as never,
              "circle-stroke-color": ["match", ["get", "crowd"], "quiet", crowdColour.quiet, "busy", crowdColour.busy, "packed", crowdColour.packed, "#000"] as never,
              "circle-stroke-width": 3,
            },
          });

          // Event venues: a hollow dot in the casing colours, not one of the traffic or crowd colours. Tap for the event.
          m.addSource("venues", { type: "geojson", data: venuePoints(latest.current.venues) });
          m.addLayer({
            id: "venue-mark",
            type: "circle",
            source: "venues",
            paint: { "circle-color": theme === "dark" ? "#0d0a08" : "#ffffff", "circle-radius": 6, "circle-stroke-color": theme === "dark" ? "#ffffff" : "#0d0a08", "circle-stroke-width": 3 },
          });
          m.on("click", "venue-mark", (e) => {
            const f = e.features?.[0];
            if (f && f.geometry.type === "Point") new maplibre.Popup({ closeButton: false }).setLngLat(f.geometry.coordinates as [number, number]).setText(String(f.properties?.text)).addTo(m);
          });
          m.on("mouseenter", "venue-mark", () => (m.getCanvas().style.cursor = "pointer"));
          m.on("mouseleave", "venue-mark", () => (m.getCanvas().style.cursor = ""));

          const label = {
            type: "symbol" as const,
            source: "traffic",
            layout: {
              "text-field": ["get", "text"] as never,
              "text-font": ["Noto Sans Bold"],
              "text-size": ["case", ["get", "selected"], 15, ["get", "pending"], 12, 13] as never,
              "text-line-height": 1.15,
              "text-justify": "center" as const,
              "text-anchor": "center" as const,
              // Downtown streets sit a block apart. Where names would land on each other, what is on now wins and the list has the rest.
              "symbol-sort-key": ["get", "rank"] as never,
              "text-padding": 2,
            },
            paint: {
              "text-color": colour,
              "text-halo-color": theme === "dark" ? "#1f1813" : "#ffffff",
              "text-halo-width": 1.75,
              "text-opacity": ["case", ["all", ["get", "pending"], ["!", ["get", "selected"]]], 0.7, 1] as never,
            },
          };
          // Street names sit on the line. Place names sit above the dot, so the two don't land on the same pixels.
          m.addLayer({ ...label, id: "traffic-label", filter: ["all", ["==", ["get", "kind"], "label"], ["!", ["get", "selected"]]] as never, layout: { ...label.layout, "text-offset": [0, 0.6] } });
          m.addLayer({
            ...label,
            id: "traffic-label-place",
            filter: ["all", ["==", ["geometry-type"], "Point"], ["!=", ["get", "kind"], "label"], ["!=", ["get", "level"], "none"], ["!", ["get", "selected"]]] as never,
            layout: { ...label.layout, "text-offset": [0, -1.8] },
          });
          // The road someone picked always shows its name and hours, over whatever is beside it.
          m.addLayer({
            ...label,
            id: "traffic-label-selected",
            filter: ["all", ["==", ["geometry-type"], "Point"], ["get", "selected"]] as never,
            layout: { ...label.layout, "text-allow-overlap": true, "text-offset": ["case", ["==", ["get", "kind"], "label"], ["literal", [0, 0.6]], ["literal", [0, -1.8]]] as never },
          });

          for (const id of ["traffic-line", "traffic-closed", "traffic-partial", "traffic-place", "traffic-label", "traffic-label-place", "traffic-label-selected"]) {
            m.on("click", id, (e) => {
              const area = e.features?.[0]?.properties?.area as string | undefined;
              latest.current.onSelect(area === latest.current.selected ? undefined : area);
            });
            m.on("mouseenter", id, () => (m.getCanvas().style.cursor = "pointer"));
            m.on("mouseleave", id, () => (m.getCanvas().style.cursor = ""));
          }
          if (!cancelled) setState("ready");
        });
        if (cancelled) m.remove();
        else map.current = m;
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    (map.current?.getSource("crowd") as { setData?: (d: FeatureCollection) => void } | undefined)?.setData?.(crowdPoints(crowd));
  }, [crowd, state]);

  useEffect(() => {
    (map.current?.getSource("venues") as { setData?: (d: FeatureCollection) => void } | undefined)?.setData?.(venuePoints(venues));
  }, [venues, state]);

  useEffect(() => {
    const src = map.current?.getSource("traffic") as { setData?: (d: FeatureCollection) => void } | undefined;
    const data = withLevels(areas, feed, selected);
    src?.setData?.(data);
    if (!map.current || !data.features.length) return;
    // First the whole picture, then the road someone picked, and back out when they let go of it.
    const focus = selected ?? null;
    if (framed.current && focused.current === focus) return;
    const first = !framed.current;
    const picked = focus ? data.features.filter((f) => f.properties?.area === focus) : [];
    const box = boundsOf(picked.length ? picked : data.features);
    if (!box) return;
    framed.current = true;
    focused.current = focus;
    map.current.fitBounds(box, { padding: picked.length ? 96 : 72, maxZoom: picked.length ? 16 : 15, duration: first ? 0 : 600 });
  }, [areas, feed, selected, state]);

  const summary = [
    ...mapAreas(areas, feed).map((a) => `${a.area}: ${a.level === "partial" ? "partly closed" : a.level}`),
    ...(crowd ?? []).map((c) => `${c.area} crowd: ${c.level}`),
    ...(venues ?? []).map((v) => `Event venue, ${v.text}`),
  ].join(", ");

  return (
    <figure className="overflow-hidden rounded-card border border-line bg-surface-raised shadow-card">
      <div className="relative h-[min(70dvh,34rem)] min-h-80">
        <div ref={box} className="h-full w-full" role="region" aria-label={`Traffic map of Bacolod. ${summary}. Use the list to pick a road.`} />
        {state === "loading" && <Skeleton className="absolute inset-0 rounded-none" />}
        {state === "failed" && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-muted">The map could not load on this device. The list beside it has the same traffic levels.</p>}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-3 text-xs text-ink-muted">
        {(["clear", "moderate", "heavy", "partial", "closed"] as const).map((l) => (
          <span key={l} className="inline-flex items-center gap-1.5 capitalize">
            <svg width="22" height="6" aria-hidden>
              <path d="M3 3 H19" stroke={level[l]} strokeWidth="5" strokeLinecap={l === "closed" || l === "partial" ? "butt" : "round"} strokeDasharray={l === "closed" ? "3 4" : l === "partial" ? "9 3" : undefined} />
            </svg>
            {l === "partial" ? "partly closed" : l}
          </span>
        ))}
        {(crowd ?? []).length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="40" height="14" aria-hidden>
              {(["quiet", "busy", "packed"] as const).map((l, i) => (
                <circle key={l} cx={7 + i * 13} cy="7" r="5" fill={crowdColour[l]} fillOpacity="0.18" stroke={crowdColour[l]} strokeWidth="2.5" />
              ))}
            </svg>
            Crowd: quiet, busy, packed
          </span>
        )}
        {(venues ?? []).length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="14" height="14" aria-hidden>
              <circle cx="7" cy="7" r="4.5" fill="var(--color-surface)" stroke="currentColor" strokeWidth="2.5" />
            </svg>
            Event venue (tap for the event)
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="6" aria-hidden>
            <path d="M3 3 H19" stroke={level.closed} strokeOpacity="0.4" strokeWidth="5" strokeDasharray="3 4" />
          </svg>
          Closes later
        </span>
      </figcaption>
    </figure>
  );
}
