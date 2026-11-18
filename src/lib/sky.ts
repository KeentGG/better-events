import type { Scene } from "./eventWeather";

/** What a WeatherScene draws, worked out from the forecast rather than the scene name alone. */
export interface SkyLook {
  /** Sky gradient, top to bottom, through `mid` when there is one. */
  top: string;
  mid?: string;
  bottom: string;
  /** Where the hour falls between day and night, which also sets whether a card wears the sky or sits beside it. */
  hour: SkyHour;
  /** How many clouds, and how dark they are (0 white, 1 near black). */
  clouds: number;
  shade: number;
  /** How strongly the sun or moon shows, 0–1. */
  light: number;
  /** Rain drops per 10,000 px², and their fall speed in px/s. */
  rain: number;
  speed: number;
  fog: boolean;
  flash: boolean;
}

export interface SkyInput {
  scene: Scene;
  isDay: boolean;
  /** 0–100. Old forecasts lack it, so it falls back to what the scene implies. */
  cloudCover?: number;
  /** Rain this hour, mm. */
  rainMm?: number;
  /** The hour shown; its time of day tints sunrise and sunset. */
  at?: string;
}

/** Cloud cover a scene implies, for forecasts without it. */
const IMPLIED_COVER: Record<Scene, number> = { clear: 5, partly: 40, cloudy: 90, fog: 100, drizzle: 80, rain: 90, downpour: 100, storm: 100 };

/** Day, the golden hour before sunset, the blue-to-purple hour after it, and night. */
export type SkyHour = "day" | "sunset" | "twilight" | "night";

/** 5–6 PM is sunset, 6–7 PM twilight, 7 PM to 5 AM night; 5–6 AM gets twilight too, before the sun is up. */
export function skyHour(iso: string): SkyHour {
  const h = manilaHour(iso);
  if (h >= 19 || h < 5) return "night";
  if (h >= 18 || h < 6) return "twilight";
  if (h >= 17) return "sunset";
  return "day";
}

/**
 * Sunset and twilight skies, top to middle to bottom. Sunset is light, blue over pink over peach; twilight
 * is dark blue into purple. Cloud and rain mute and darken them rather than wipe them out, so a rainy
 * 5 PM still reads as late afternoon.
 */
const DUSK = {
  sunset: ["#86abe6", "#f4b0cf", "#fbb486"],
  twilight: ["#0d1640", "#2a2a6a", "#5b3a80"],
} as const;

/** Clear, overcast and storm-dark skies, by day and night; a forecast sits somewhere between them. */
const CLEAR = { day: ["#2f7fd0", "#9fd0f5"], night: ["#081230", "#1d2d58"] } as const;
const OVERCAST = { day: ["#7f8b98", "#c2cad2"], night: ["#1a1f28", "#2e3540"] } as const;
const DARK = { day: ["#27303b", "#4a5562"], night: ["#06080c", "#141920"] } as const;
/** Sunrise and sunset light, mixed in near those hours when the sky is open enough to show it. */
const GOLDEN = ["#4a62a8", "#f4a259"] as const;

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) =>
  `#${hex(a)
    .map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, "0"))
    .join("")}`;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Bacolod's sun rises around 5:45 and sets around 5:45 PM all year, give or take half an hour. */
const SUNRISE = 5.75;
const SUNSET = 17.75;

const manilaHour = (iso: string) => {
  const d = new Date(Date.parse(iso) + 8 * 3_600_000);
  return d.getUTCHours() + d.getUTCMinutes() / 60;
};

const RAINY: Scene[] = ["drizzle", "rain", "downpour", "storm"];

export function skyLook({ scene, isDay, cloudCover, rainMm = 0, at }: SkyInput): SkyLook {
  const cover = clamp((cloudCover ?? IMPLIED_COVER[scene]) / 100);
  // Rain and thunder darken the sky beyond what cover alone does: a light shower under broken cloud stays bright.
  const gloom = clamp(rainMm / 6 + (scene === "storm" ? 0.55 : scene === "downpour" ? 0.3 : scene === "rain" ? 0.1 : 0));
  const hour = at ? skyHour(at) : isDay ? "day" : "night";
  const rainy = RAINY.includes(scene);
  const heavy = scene === "downpour" || scene === "storm";
  const rest = {
    hour,
    clouds: cover < 0.08 ? 0 : Math.round(1 + cover * 9),
    shade: clamp(0.05 + 0.35 * cover * cover + 0.55 * gloom),
    light: (1 - cover) ** 1.5 * (1 - gloom),
    rain: rainy ? Math.min(30, (scene === "drizzle" ? 3 : 6) + rainMm * (scene === "drizzle" ? 6 : 3)) : 0,
    // Ordinary rain falls as fast as it is heavy: a couple of mm an hour shouldn't streak like a downpour.
    speed: !rainy ? 0 : scene === "drizzle" ? 420 : heavy ? 1300 : Math.min(1000, 550 + rainMm * 110),
    fog: scene === "fog" || scene === "downpour",
    flash: scene === "storm",
  };

  if (hour === "sunset") {
    // Muted toward a pale grey, never toward dark, and its clouds stay white.
    const [top, mid, bottom] = DUSK.sunset.map((c, i) => mix(mix(c, OVERCAST.day[i ? 1 : 0], cover * 0.06), DARK.day[i ? 1 : 0], gloom * 0.08));
    // Fewer clouds than the cover says, so the colour shows between them instead of a white haze.
    return { top, mid, bottom, ...rest, clouds: Math.min(rest.clouds, 5), shade: Math.min(rest.shade, 0.08) };
  }
  if (hour === "twilight") {
    const [top, mid, bottom] = DUSK.twilight.map((c, i) => mix(mix(c, OVERCAST.night[i ? 1 : 0], cover * 0.15), DARK.night[i ? 1 : 0], gloom * 0.25));
    return { top, mid, bottom, ...rest };
  }

  const time = hour === "day" ? "day" : "night";

  let top = mix(mix(CLEAR[time][0], OVERCAST[time][0], cover), DARK[time][0], gloom);
  let bottom = mix(mix(CLEAR[time][1], OVERCAST[time][1], cover), DARK[time][1], gloom);

  // Golden light within an hour of sunrise or sunset, only through gaps in the cloud.
  if (at) {
    const h = manilaHour(at);
    const near = clamp(1 - Math.min(Math.abs(h - SUNRISE), Math.abs(h - SUNSET)));
    const glow = near * (1 - cover) * (1 - gloom) * 0.7;
    if (glow > 0) {
      top = mix(top, GOLDEN[0], glow * 0.6);
      bottom = mix(bottom, GOLDEN[1], glow);
    }
  }

  return { top, bottom, ...rest };
}
