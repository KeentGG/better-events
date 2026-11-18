import { describe, expect, it } from "vitest";
import { adviceFor, forecastFor, sceneOf, sceneOfHour, showeryHour, thunderyHour } from "./eventWeather";
import type { ScheduleEvent, WeatherHour, WeatherNow } from "./types";

const H = 3_600_000;
const t0 = Date.parse("2026-10-17T02:00:00Z"); // 10 AM in Bacolod

/** 48 forecast hours from t0, raining from hour 5 on. */
const hourly: WeatherHour[] = Array.from({ length: 48 }, (_, i) => ({
  at: new Date(t0 + i * H).toISOString(),
  temperatureC: 28 + (i % 5),
  precipitationProbability: i >= 5 ? 70 : 10,
  precipitationMm: i >= 5 ? 1 : 0,
  weatherCode: i >= 5 ? 61 : 1,
  isDay: true,
}));
const weather = { temperatureC: 30, apparentC: 33, precipitationProbability: 10, weatherCode: 1, isDay: true, fetchedAt: "", hourly } satisfies WeatherNow;

const event = (over: Partial<ScheduleEvent>): ScheduleEvent => ({
  id: "e",
  title: "Parade",
  kind: "parade",
  venue: "Lacson St",
  startsAt: new Date(t0 + 2 * H).toISOString(),
  endsAt: null,
  status: "on_time",
  note: null,
  official: true,
  topics: [],
  ...over,
});

describe("sceneOf", () => {
  it("reads WMO codes and heavy rain", () => {
    expect(sceneOf(0)).toBe("clear");
    expect(sceneOf(2)).toBe("partly");
    expect(sceneOf(61)).toBe("rain");
    expect(sceneOf(61, 6)).toBe("downpour");
    expect(sceneOf(95)).toBe("storm");
  });
});

describe("sceneOfHour", () => {
  // 5 PM on 10 Oct 2026: the forecast said rain showers at 84%, the street was dry under thunder.
  const hour: WeatherHour = { at: new Date(t0).toISOString(), temperatureC: 27, precipitationProbability: 16, showerProbability: 88, heavyProbability: 0, precipitationMm: 0.8, showersMm: 0.7, weatherCode: 80, isDay: true, cape: 1840, liftedIndex: -4.2 };

  it("draws no rain when few runs put real rain here, and says showers and thunder instead", () => {
    expect(sceneOfHour(hour)).toBe("cloudy");
    expect(showeryHour(hour)).toBe(true);
    expect(thunderyHour(hour)).toBe(true);
    expect(sceneOfHour({ ...hour, precipitationProbability: 40 })).toBe("drizzle");
  });
  it("draws rain and storms once the runs agree", () => {
    expect(sceneOfHour({ ...hour, precipitationProbability: 55, liftedIndex: 0 })).toBe("rain");
    expect(sceneOfHour({ ...hour, precipitationProbability: 55 })).toBe("storm");
    expect(sceneOfHour({ ...hour, heavyProbability: 35, cape: 0 })).toBe("downpour");
  });
  it("keeps a rain code dry when the runs are dry", () => {
    expect(sceneOfHour({ ...hour, precipitationProbability: 2, showerProbability: 30 })).toBe("cloudy");
  });
  it("reads an older snapshot by its code", () => {
    expect(sceneOfHour({ at: hour.at, temperatureC: 27, precipitationProbability: 84, precipitationMm: 0.8, weatherCode: 80, isDay: true })).toBe("rain");
  });
});

describe("forecastFor", () => {
  it("draws the start hour when there is no end", () => {
    const w = forecastFor(event({}), weather, t0);
    expect(w).toMatchObject({ mode: "ambient", slot: { at: hourly[2].at, scene: "partly" } });
  });

  it("strips the hours from start to end", () => {
    const w = forecastFor(event({ endsAt: new Date(t0 + 6 * H).toISOString() }), weather, t0);
    expect(w?.mode).toBe("timeline");
    if (w?.mode !== "timeline") return;
    expect(w.slots.map((s) => s.at)).toEqual(hourly.slice(2, 6).map((h) => h.at));
    expect(w.slots.at(-1)?.scene).toBe("rain");
  });

  it("folds a long event into at most eight slots, keeping the worst", () => {
    const w = forecastFor(event({ startsAt: new Date(t0).toISOString(), endsAt: new Date(t0 + 20 * H).toISOString() }), weather, t0);
    if (w?.mode !== "timeline") throw new Error("expected a timeline");
    expect(w.slots.length).toBeLessThanOrEqual(8);
    expect(w.slots.reduce((n, s) => n + s.hours, 0)).toBe(20);
    expect(w.slots[1].scene).toBe("rain"); // hours 3-5, raining from 5
  });

  it("shows nothing past the forecast, or for done, cancelled and timeless events", () => {
    expect(forecastFor(event({ startsAt: new Date(t0 + 60 * H).toISOString() }), weather, t0)).toBeNull();
    expect(forecastFor(event({ endsAt: new Date(t0 + 60 * H).toISOString() }), weather, t0)).toBeNull();
    expect(forecastFor(event({ status: "cancelled" }), weather, t0)).toBeNull();
    expect(forecastFor(event({ endsAt: new Date(t0 + 3 * H).toISOString() }), weather, t0 + 4 * H)).toBeNull();
    expect(forecastFor(event({}), { ...weather, hourly: undefined }, t0)).toBeNull();
  });

  it("uses the current hour for a start-only event already on", () => {
    const w = forecastFor(event({ startsAt: new Date(t0).toISOString(), actualStart: new Date(t0).toISOString() }), weather, t0 + 6 * H + 60_000);
    expect(w).toMatchObject({ mode: "ambient", slot: { at: hourly[6].at, scene: "rain" } });
  });

  it("folds the day's daytime for an event with a date but no time", () => {
    // Sat 17 Oct with no time: the forecast from 10 AM to 10 PM, raining from 3 PM.
    const w = forecastFor(event({ startsAt: "2026-10-16T16:00:00Z", timeKnown: false }), weather, t0);
    expect(w).toMatchObject({ mode: "day", lowC: 28, slot: { hours: 12, scene: "rain", temperatureC: 32 } });
    expect(forecastFor(event({ startsAt: "2026-10-16T16:00:00Z", status: "tba" }), weather, t0)).toMatchObject({ mode: "day" });
    expect(forecastFor(event({ startsAt: "2026-10-20T16:00:00Z", timeKnown: false }), weather, t0)).toBeNull();
  });

  it("covers an all-day event from 6 AM to 10 PM", () => {
    const w = forecastFor(event({ startsAt: "2026-10-16T16:00:00Z", allDay: true }), weather, t0);
    if (w?.mode !== "timeline") throw new Error("expected a timeline");
    // The forecast starts at 10 AM, so the strip runs 10 AM to 10 PM.
    expect(w.slots.reduce((n, s) => n + s.hours, 0)).toBe(12);
  });
});

describe("adviceFor", () => {
  const clock = (iso: string) => new Date(iso).toISOString().slice(11, 16);
  const slot = (at: number, over = {}) => ({ at: new Date(t0 + at * H).toISOString(), hours: 1, temperatureC: 28, precipitationProbability: 10, scene: "clear" as const, isDay: true, precipitationMm: 0, ...over });

  it("names when rain starts", () => {
    expect(adviceFor([slot(0), slot(1, { precipitationProbability: 80, scene: "rain" })], clock)).toBe("Rain likely from 03:00. Bring a poncho.");
  });
  it("says thunder apart from rain, and showers apart from both", () => {
    expect(adviceFor([slot(0, { scene: "drizzle", thunder: true })], clock)).toMatch(/^Thunderstorms around/);
    expect(adviceFor([slot(0, { scene: "cloudy", showers: true })], clock)).toMatch(/^Scattered showers possible/);
    expect(adviceFor([slot(0, { uvIndex: 9 })], clock)).toMatch(/^Hot under the sun/);
  });
  it("puts storms first and falls back to dry", () => {
    expect(adviceFor([slot(0, { scene: "rain" }), slot(1, { scene: "storm" })], clock)).toMatch(/^Thunderstorms likely from/);
    expect(adviceFor([slot(0)], clock)).toBe("Dry weather.");
  });
});
