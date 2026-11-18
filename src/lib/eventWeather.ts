import { manilaMidnight, phaseOf } from "./eventPhase";
import type { ScheduleEvent, WeatherHour, WeatherNow } from "./types";

const HOUR = 3_600_000;

/** What the sky is doing, as a card draws it. Worst last, so a mixed stretch shows its worst. */
export const SCENES = ["clear", "partly", "cloudy", "fog", "drizzle", "rain", "downpour", "storm"] as const;
export type Scene = (typeof SCENES)[number];

export const sceneLabel: Record<Scene, string> = {
  clear: "Clear",
  partly: "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Foggy",
  drizzle: "Light showers",
  rain: "Rain",
  downpour: "Heavy rain",
  storm: "Thunderstorms",
};

/** Open-Meteo's WMO weather code, plus the hour's rain, as a scene. Bacolod never sees snow, so those codes read as rain. */
export function sceneOf(code: number, precipitationMm = 0): Scene {
  if (code >= 95) return "storm";
  if (code === 65 || code === 67 || code === 82 || precipitationMm >= 4) return "downpour";
  if ((code >= 61 && code <= 64) || code === 66 || code === 80 || code === 81 || (code >= 71 && code <= 86)) return "rain";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code === 45 || code === 48) return "fog";
  if (code === 3) return "cloudy";
  if (code === 1 || code === 2) return "partly";
  return "clear";
}

const worse = (s: Scene, than: Scene) => SCENES.indexOf(s) >= SCENES.indexOf(than);

/**
 * Whether storms could rumble this hour: unstable air and the model setting off storm cells. They can
 * pass by without a drop, which is why this is kept apart from the rain.
 */
export function thunderyHour(h: WeatherHour): boolean {
  if (h.weatherCode >= 95) return true;
  return (h.cape ?? 0) >= 1000 && (h.liftedIndex ?? 0) <= -2 && (h.showersMm ?? 0) >= 0.3;
}

/**
 * Whether a passing shower is on the cards this hour without being likely: a fair share of runs put
 * noticeable rain here, or most agree on more than a trace. Said in words, never drawn.
 */
export function showeryHour(h: WeatherHour): boolean {
  if (h.showerProbability === undefined) return false;
  return h.precipitationProbability >= 20 || (h.showerProbability >= 60 && h.precipitationMm >= 0.3);
}

/**
 * A forecast hour as a scene. With ensemble odds, rain is drawn only when the runs make it likely here:
 * a weather code of "rain showers" over a trace of rain is a storm cell somewhere in the area, and a sky
 * that rains on the card while the street is dry reads as wrong.
 */
export function sceneOfHour(h: WeatherHour): Scene {
  const byCode = sceneOf(h.weatherCode, h.precipitationMm);
  // An older snapshot: the code is all there is.
  if (h.showerProbability === undefined) return byCode;
  const wet: Scene | null =
    h.precipitationMm >= 4 || (h.heavyProbability ?? 0) >= 30 ? "downpour" : h.precipitationProbability >= 50 ? "rain" : h.precipitationProbability >= 20 ? "drizzle" : null;
  if (!wet) return worse(byCode, "drizzle") ? "cloudy" : byCode;
  return thunderyHour(h) && worse(wet, "rain") ? "storm" : wet;
}

/** A forecast hour, or several hours folded into one slot, as a card shows it. */
export interface WeatherSlot {
  at: string;
  /** Hours it covers. */
  hours: number;
  temperatureC: number;
  /** The stickiest hour's feels-like; missing on older forecasts. */
  apparentC?: number;
  /** Chance of rain you'd notice, as on `WeatherHour`. */
  precipitationProbability: number;
  scene: Scene;
  /** A passing shower is possible, though the sky isn't drawn raining. */
  showers?: boolean;
  /** Storms could rumble nearby, whatever the rain does. */
  thunder?: boolean;
  /** The strongest sun; missing on older forecasts. */
  uvIndex?: number;
  isDay: boolean;
  /** 0–100, the cloudiest hour; missing on older forecasts. */
  cloudCover?: number;
  /** Rain in the wettest hour, mm. */
  precipitationMm: number;
}

export type EventWeather =
  /** Only a start is known: the sky at that hour, drawn across the card. */
  | { mode: "ambient"; slot: WeatherSlot }
  /** Only the date is known: that day's daytime folded into one slot, with its coolest hour, said in words. */
  | { mode: "day"; slot: WeatherSlot; lowC: number }
  /** A start and an end: the stretch in between, hour by hour. */
  | { mode: "timeline"; slots: WeatherSlot[] };

/** A long event folds into this many slots at most, so the strip fits a phone. */
const MAX_SLOTS = 8;

function fold(hours: WeatherHour[]): WeatherSlot {
  const worst = hours.reduce((a, h) => Math.max(a, SCENES.indexOf(sceneOfHour(h))), 0);
  const most = (pick: (h: WeatherHour) => number | undefined) => (hours.some((h) => pick(h) !== undefined) ? Math.max(...hours.map((h) => pick(h) ?? 0)) : undefined);
  return {
    at: hours[0].at,
    hours: hours.length,
    // The hottest hour is the one people feel.
    temperatureC: Math.max(...hours.map((h) => h.temperatureC)),
    apparentC: most((h) => h.apparentC),
    precipitationProbability: Math.max(...hours.map((h) => h.precipitationProbability)),
    scene: SCENES[worst],
    showers: hours.some(showeryHour),
    thunder: hours.some(thunderyHour),
    uvIndex: most((h) => h.uvIndex),
    isDay: hours[0].isDay,
    cloudCover: most((h) => h.cloudCover),
    precipitationMm: Math.max(...hours.map((h) => h.precipitationMm)),
  };
}

/** The next `count` forecast hours, one slot each, starting with the hour we're in. */
export function hoursAhead(weather: WeatherNow | undefined, count: number): WeatherSlot[] {
  return (weather?.hourly ?? []).slice(0, count).map((h) => fold([h]));
}

/** The forecast hour `t` falls in. */
const hourAt = (hourly: WeatherHour[], t: number) => hourly.find((h) => t >= Date.parse(h.at) && t < Date.parse(h.at) + HOUR);

/**
 * The weather for an event's card, or null when there is nothing honest to show: it is over, called
 * off, or sits past the forecast.
 */
export function forecastFor(event: ScheduleEvent, weather: WeatherNow | undefined, now = Date.now()): EventWeather | null {
  const hourly = weather?.hourly;
  if (!hourly?.length) return null;
  const phase = phaseOf(event, now);
  if (phase === "done" || phase === "cancelled") return null;

  // A date with no time yet: the worst of that day's 6 AM to 10 PM, or what's left of it.
  if ((event.timeKnown === false || event.status === "tba") && !event.actualStart) {
    const day = manilaMidnight(event.startsAt);
    const span = hourly.filter((h) => Date.parse(h.at) + HOUR > Math.max(day + 6 * HOUR, now) && Date.parse(h.at) < day + 22 * HOUR);
    return span.length ? { mode: "day", slot: fold(span), lowC: Math.min(...span.map((h) => h.temperatureC)) } : null;
  }

  // An all-day event counts as 6 AM to 10 PM, as phaseOf does.
  const day = event.allDay ? manilaMidnight(event.startsAt) : 0;
  const start = event.allDay ? day + 6 * HOUR : Date.parse(event.actualStart ?? event.startsAt);
  const end = event.allDay ? day + 22 * HOUR : event.endsAt ? Date.parse(event.endsAt) : null;

  if (end === null) {
    // Already on: what it's like out there now.
    const hour = hourAt(hourly, Math.max(start, now));
    return hour ? { mode: "ambient", slot: fold([hour]) } : null;
  }

  const span = hourly.filter((h) => Date.parse(h.at) + HOUR > start && Date.parse(h.at) < end);
  // Past the forecast, or it runs out before the end: a strip that stops short would mislead.
  if (span.length === 0 || Date.parse(span[span.length - 1].at) + HOUR < end) return null;
  const size = Math.ceil(span.length / MAX_SLOTS);
  const slots: WeatherSlot[] = [];
  for (let i = 0; i < span.length; i += size) slots.push(fold(span.slice(i, i + size)));
  return { mode: "timeline", slots };
}

const wet = (s: WeatherSlot) => s.precipitationProbability >= 60 || worse(s.scene, "rain");
const hot = (s: WeatherSlot) => s.isDay && (s.temperatureC >= 32 || (s.apparentC ?? 0) >= 38 || (s.uvIndex ?? 0) >= 8);

/** One line of advice for a stretch of weather, worst first. `clock` formats a slot's time. */
export function adviceFor(slots: WeatherSlot[], clock: (iso: string) => string): string {
  const storm = slots.find((s) => s.scene === "storm");
  if (storm) return storm === slots[0] ? "Thunderstorms likely. Have somewhere to shelter." : `Thunderstorms likely from ${clock(storm.at)}. Have somewhere to shelter.`;
  const rain = slots.find(wet);
  if (rain) {
    if (slots.every(wet)) return "Rain likely throughout. Bring a poncho, not an umbrella.";
    return rain === slots[0] ? "Rain likely at the start. Bring a poncho." : `Rain likely from ${clock(rain.at)}. Bring a poncho.`;
  }
  // Storm cells about, but the runs don't put rain here: say so, since it may well stay dry.
  if (slots.some((s) => s.thunder)) return "Thunderstorms around. A downpour may hit or miss you, so keep a poncho handy.";
  if (slots.some((s) => s.showers || s.scene === "drizzle" || s.precipitationProbability >= 30)) return "Scattered showers possible. Keep a poncho handy.";
  if (slots.some(hot)) return "Hot under the sun. Find shade and drink water.";
  return "Dry weather.";
}

/** A day in a few words, for an event with no time yet: "rain likely", "showers possible", "mostly sunny". */
export function dayOutlook(slot: WeatherSlot): string {
  if (slot.scene === "storm") return "thunderstorms likely";
  if (slot.precipitationProbability >= 60 || slot.scene === "rain" || slot.scene === "downpour") return "rain likely";
  if (slot.thunder) return "thunderstorms around";
  if (slot.showers || slot.precipitationProbability >= 30 || slot.scene === "drizzle") return "showers possible";
  if (slot.scene === "cloudy" || slot.scene === "fog") return "cloudy";
  return slot.scene === "partly" ? "partly cloudy" : "mostly sunny";
}
