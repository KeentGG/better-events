import type { WeatherHour, WeatherNow } from "../../src/lib/types";

// Bacolod City
const LAT = 10.6765;
const LNG = 122.9509;

/** The place every Open-Meteo call is for, and the timezone its hours are read in. */
export const BACOLOD = { latitude: LAT, longitude: LNG, timezone: "Asia/Manila" } as const;

/** The hourly variables the site reads. The demo weather fetch asks the archive for the same ones. */
export const HOURLY_VARIABLES = "temperature_2m,apparent_temperature,precipitation_probability,precipitation,showers,weather_code,is_day,cloud_cover,cape,lifted_index,uv_index";

/** Hourly forecasts past about a week are too rough to put on an event card. */
const FORECAST_DAYS = 8;

/** Rain in an hour, mm: any at all, enough to notice, and heavy. Model rain is averaged over a cell several km wide, so these run low. */
const ANY_MM = 0.1;
const NOTICEABLE_MM = 2;
const HEAVY_MM = 7.5;
/** Fewer ensemble runs than this for an hour and its shares mean little. */
const MIN_RUNS = 20;

const place = { latitude: String(LAT), longitude: String(LNG), forecast_days: String(FORECAST_DAYS), timeformat: "unixtime", timezone: BACOLOD.timezone };

type RainOdds = Pick<WeatherHour, "precipitationProbability" | "showerProbability" | "heavyProbability" | "precipitationMm">;

/** The arrays Open-Meteo returns for the requested hourly variables, in unix seconds. A variable the API does not have is undefined. */
export interface OpenMeteoHourly {
  time: number[];
  temperature_2m?: (number | null)[];
  apparent_temperature?: (number | null)[];
  precipitation_probability?: (number | null)[];
  precipitation?: (number | null)[];
  showers?: (number | null)[];
  weather_code?: (number | null)[];
  is_day?: (0 | 1 | null)[];
  cloud_cover?: (number | null)[];
  cape?: (number | null)[];
  lifted_index?: (number | null)[];
  uv_index?: (number | null)[];
}

/** What the live forecast's `current` block holds. The historical archive has no `current`; its hour does. */
interface OpenMeteoCurrent {
  temperature_2m: number;
  apparent_temperature: number;
  precipitation_probability: number | null;
  weather_code: number;
  is_day: 0 | 1;
}

/**
 * Turns Open-Meteo hourly arrays into the site's weather, up to `now`: the hours still ahead, and the
 * current readings (taken from `current`, or from the hour holding `now` when there is none, as in the
 * historical archive). Missing variables keep their old fallbacks.
 */
export function weatherFromHourly(hourly: OpenMeteoHourly, now: number, current?: OpenMeteoCurrent, odds: Map<number, RainOdds> = new Map()): WeatherNow {
  // Hours already gone are no use to anyone, except the one we're in.
  const from = now - 3_600_000;
  const hours: WeatherHour[] = [];
  hourly.time.forEach((t, i) => {
    const temperature = hourly.temperature_2m?.[i];
    const code = hourly.weather_code?.[i];
    if (t * 1000 <= from || temperature == null || code == null) return;
    hours.push({
      at: new Date(t * 1000).toISOString(),
      temperatureC: temperature,
      apparentC: hourly.apparent_temperature?.[i] ?? undefined,
      precipitationProbability: hourly.precipitation_probability?.[i] ?? 0,
      precipitationMm: hourly.precipitation?.[i] ?? 0,
      ...odds.get(t),
      showersMm: hourly.showers?.[i] ?? undefined,
      weatherCode: code,
      isDay: hourly.is_day?.[i] === 1,
      cloudCover: hourly.cloud_cover?.[i] ?? undefined,
      cape: hourly.cape?.[i] ?? undefined,
      liftedIndex: hourly.lifted_index?.[i] ?? undefined,
      uvIndex: hourly.uv_index?.[i] ?? undefined,
    });
  });

  const thisHour = hours.find((h) => Date.parse(h.at) <= now);
  return {
    temperatureC: current?.temperature_2m ?? thisHour?.temperatureC ?? 0,
    apparentC: current?.apparent_temperature ?? thisHour?.apparentC ?? current?.temperature_2m ?? thisHour?.temperatureC ?? 0,
    precipitationProbability: thisHour?.precipitationProbability ?? current?.precipitation_probability ?? 0,
    weatherCode: current?.weather_code ?? thisHour?.weatherCode ?? 0,
    isDay: current ? current.is_day === 1 : (thisHour?.isDay ?? false),
    fetchedAt: new Date().toISOString(),
    hourly: hours,
  };
}

/**
 * How the ensemble runs (about 120 across ECMWF, GFS and ICON) split on each hour's rain, by unix time.
 * One forecast's "84% rain" is the chance of a trace somewhere in the cell; the share of runs with rain
 * you'd notice says whether to expect to get wet. Empty when the ensemble can't be had.
 */
async function fetchRainOdds(): Promise<Map<number, RainOdds>> {
  const odds = new Map<number, RainOdds>();
  const url = new URL("https://ensemble-api.open-meteo.com/v1/ensemble");
  url.search = new URLSearchParams({ ...place, hourly: "precipitation", models: "ecmwf_ifs025,gfs025,icon_global" }).toString();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ensemble ${res.status}`);
    const { hourly } = (await res.json()) as { hourly: { time: number[] } & Record<string, (number | null)[]> };
    const runs = Object.keys(hourly).filter((k) => k.startsWith("precipitation"));
    hourly.time.forEach((t, i) => {
      const mm = runs.map((k) => hourly[k][i]).filter((v): v is number => v != null).sort((a, b) => a - b);
      if (mm.length < MIN_RUNS) return;
      const share = (min: number) => Math.round((100 * mm.filter((v) => v >= min).length) / mm.length);
      odds.set(t, { precipitationProbability: share(NOTICEABLE_MM), showerProbability: share(ANY_MM), heavyProbability: share(HEAVY_MM), precipitationMm: mm[Math.floor(mm.length / 2)] });
    });
  } catch (err) {
    // The single forecast still stands on its own, read the old way.
    console.error("weather: no ensemble rain odds:", err);
  }
  return odds;
}

/**
 * Open-Meteo: free, no key, 10k calls/day, non-commercial use.
 * Any hourly variable can be requested under `current`.
 */
export async function fetchWeather(): Promise<WeatherNow> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    ...place,
    current: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,is_day",
    hourly: HOURLY_VARIABLES,
  }).toString();

  const [res, odds] = await Promise.all([fetch(url), fetchRainOdds()]);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { current, hourly } = (await res.json()) as { current: OpenMeteoCurrent; hourly: OpenMeteoHourly };

  return weatherFromHourly(hourly, Date.now(), current, odds);
}
