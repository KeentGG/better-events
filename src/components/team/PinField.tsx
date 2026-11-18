import { LocateFixed, MapPinOff } from "lucide-react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useId, useRef, useState } from "react";
import { openMap, type MapLibre } from "../../lib/map";
import type { LatLng } from "../../lib/types";
import { Button, Skeleton } from "../../ui";

// --color-brand-600. MapLibre draws the marker as SVG with a fill attribute, which can't read CSS variables.
const PIN_COLOR = "oklch(0.52 0.21 345)";

/**
 * An optional map pin: tap the map to drop it, drag it to move it, or use the phone's location when
 * standing at the spot. The map opens on the pin, or on Bacolod when there is none.
 */
export function PinField({ label = "Map pin (optional)", value, onChange }: { label?: string; value: LatLng | null; onChange: (pin: LatLng | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const lib = useRef<MapLibre | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string>();
  const hintId = useId();
  const first = useRef(value);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!box.current) return;
        const start = first.current;
        const m = await openMap(box.current, start ? { center: [start.lng, start.lat], zoom: 16, bounds: undefined } : {}, (m, maplibre) => {
          lib.current = maplibre;
          m.on("click", (e) => change.current({ lat: round(e.lngLat.lat), lng: round(e.lngLat.lng) }));
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
      marker.current = null;
    };
  }, []);

  // Keep the marker where the value says, whether it came from a tap, a drag or the location button.
  useEffect(() => {
    const m = map.current;
    const maplibre = lib.current;
    if (!m || !maplibre) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      marker.current = new maplibre.Marker({ color: PIN_COLOR, draggable: true }).setLngLat([value.lng, value.lat]).addTo(m);
      marker.current.on("dragend", () => {
        const at = marker.current?.getLngLat();
        if (at) change.current({ lat: round(at.lat), lng: round(at.lng) });
      });
    } else {
      marker.current.setLngLat([value.lng, value.lat]);
    }
  }, [value, state]);

  function locate() {
    if (!navigator.geolocation) return setLocateError("This device can't share its location.");
    setLocating(true);
    setLocateError(undefined);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const pin = { lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) };
        onChange(pin);
        map.current?.flyTo({ center: [pin.lng, pin.lat], zoom: 17 });
      },
      () => {
        setLocating(false);
        setLocateError("Couldn't get your location. Allow location for this site, or tap the map instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div className="relative h-60 overflow-hidden rounded-control border border-line-strong sm:h-72">
        <div ref={box} className="h-full w-full" role="region" aria-label="Map. Tap to drop the pin, then drag it to adjust." aria-describedby={hintId} />
        {state === "loading" && <Skeleton className="absolute inset-0 rounded-none" />}
        {state === "failed" && (
          <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-ink-muted">The map couldn't load on this device. You can still save without a pin.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p id={hintId} className="mr-auto text-sm text-ink-muted">
          {value ? `Pinned at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : "Tap the map where it is."}
        </p>
        <Button variant="ghost" size="sm" loading={locating} icon={<LocateFixed className="size-4" aria-hidden />} onClick={locate}>
          I'm here
        </Button>
        {value && (
          <Button variant="ghost" size="sm" icon={<MapPinOff className="size-4" aria-hidden />} onClick={() => onChange(null)}>
            Remove pin
          </Button>
        )}
      </div>
      {locateError && <p className="text-sm text-danger-ink">{locateError}</p>}
    </fieldset>
  );
}

/** Six decimals is about 10 cm, finer than anyone taps. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;
