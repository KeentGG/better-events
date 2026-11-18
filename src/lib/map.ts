import type { Map as MapLibreMap, MapOptions } from "maplibre-gl";

/*
 * The base map every map in the app shares: OpenStreetMap data served free by OpenFreeMap (no key, no
 * request limits), drawn with MapLibre GL, warmed to the abaca palette. MapLibre is loaded only when a
 * map is shown, so pages without one stay light.
 */

const STYLE = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" };

// MapLibre needs plain colours, so these mirror the tokens.
const tint = {
  light: { background: "#f6efe3", water: "#d6e0da", park: "#e7e6d2", landuse_residential: "#f1e8d9", building: "#eadfcd" },
  dark: { background: "#1f1813", water: "#14201f", park: "#221f17", landuse_residential: "#241c16", building: "#2b231c" },
};

/** Bacolod, where every map opens. */
export const BACOLOD_BOUNDS: [[number, number], [number, number]] = [
  [122.936, 10.646],
  [122.968, 10.712],
];

export type MapTheme = "light" | "dark";
export type MapLibre = typeof import("maplibre-gl");

export function mapTheme(): MapTheme {
  const forced = document.documentElement.dataset.theme;
  return (forced ? forced === "dark" : matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
}

/**
 * Loads MapLibre and opens the base map in `container`, framed on Bacolod unless `options` say
 * otherwise. `onLoad` runs once the style is in and tinted, with the MapLibre module for markers and
 * controls. Throws when MapLibre or WebGL is unavailable.
 */
export async function openMap(
  container: HTMLElement,
  options: Partial<MapOptions>,
  onLoad: (map: MapLibreMap, maplibre: MapLibre, theme: MapTheme) => void,
): Promise<MapLibreMap> {
  const [{ default: maplibre }] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
  const theme = mapTheme();
  const map = new maplibre.Map({
    container,
    style: STYLE[theme],
    bounds: BACOLOD_BOUNDS,
    fitBoundsOptions: { padding: 24 },
    attributionControl: { compact: true },
    cooperativeGestures: true,
    ...options,
  });
  map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
  map.on("load", () => {
    for (const [id, color] of Object.entries(tint[theme])) {
      const layer = map.getLayer(id);
      if (layer) map.setPaintProperty(id, layer.type === "background" ? "background-color" : "fill-color", color);
    }
    onLoad(map, maplibre, theme);
  });
  map.on("error", (e) => console.warn("map", e.error?.message));
  return map;
}
